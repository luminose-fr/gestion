/**
 * Worker — jeton de session signé et CORS.
 *
 * Ce que ces tests protègent : avant le 16/08/2026, verifySessionToken se
 * contentait de décoder du base64. WORKER_URL étant en clair dans le bundle
 * public, n'importe qui pouvait fabriquer un jeton et obtenir un accès complet
 * en lecture ET écriture sur Notion. Les cas « tokens forgés » ci-dessous sont
 * la garantie que ce trou ne se rouvre pas.
 *
 * LA ROUTE VISÉE A CHANGÉ, PAS CE QUI EST TESTÉ. Ces cas passaient par le proxy
 * Notion `/v1/*`, retiré le 20/09/2026. Ils visent maintenant `/api/corpus` —
 * choisie parce qu'elle est derrière le même contrôle de jeton et qu'elle ne
 * touche pas D1 : l'environnement de ce fichier n'a pas de binding. Ce qu'on
 * vérifie reste le jeton, jamais la route.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
// @ts-ignore — le Worker est du JS sans types
import worker from '../src/index';

const ENV = {
  AUTH_USERNAME: 'florent',
  AUTH_PASSWORD: 'motdepasse-de-test',
  SESSION_SECRET: 'secret-de-signature-de-test',
  ONE_MIN_API_KEY: '1min-key',
};

const ORIGIN = 'https://gestion.luminose.fr';

type LoginBody = { sessionToken: string };

const login = (username: string, password: string, origin = ORIGIN, env: any = ENV) =>
  worker.fetch(new Request('https://w.dev/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ username, password }),
  }), env);

const appelAuthentifie = (token: string | null, env: any = ENV) =>
  worker.fetch(new Request('https://w.dev/api/corpus', {
    method: 'GET',
    headers: { 'X-Session-Token': token ?? '', Origin: ORIGIN },
  }), env);

/** Signe un payload avec le vrai secret — pour fabriquer des cas limites légitimes. */
const signPayload = async (payloadB64: string, secret = ENV.SESSION_SECRET) => {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
};

beforeAll(() => {
  // Filet : aucune de ces routes ne sort, mais un appel réseau qui
  // réapparaîtrait ne doit pas faire dépendre ces tests d'Internet.
  vi.stubGlobal('fetch', async () =>
    new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  );
});

describe('login', () => {
  it('refuse un mauvais mot de passe', async () => {
    expect((await login('florent', 'mauvais')).status).toBe(401);
  });

  it('délivre un jeton au format payload.signature', async () => {
    const res = await login(ENV.AUTH_USERNAME, ENV.AUTH_PASSWORD);
    expect(res.status).toBe(200);
    const { sessionToken } = await res.json() as LoginBody;
    expect(sessionToken).toMatch(/^[^.]+\.[^.]+$/);
  });
});

describe('accès à une route authentifiée', () => {
  it('accepte un jeton légitime', async () => {
    const { sessionToken } = await (await login(ENV.AUTH_USERNAME, ENV.AUTH_PASSWORD)).json() as LoginBody;
    expect((await appelAuthentifie(sessionToken)).status).toBe(200);
  });

  it('rejette un jeton expiré, pourtant correctement signé', async () => {
    const payload = btoa(JSON.stringify({ token: 'x', expiresAt: Date.now() - 1000 }));
    const token = `${payload}.${await signPayload(payload)}`;
    expect((await appelAuthentifie(token)).status).toBe(401);
  });
});

describe('jetons forgés — le trou d’avant', () => {
  it('rejette l’ancien format non signé', async () => {
    const oldStyle = btoa(JSON.stringify({ token: 'x', expiresAt: 9999999999999 }));
    expect((await appelAuthentifie(oldStyle)).status).toBe(401);
  });

  it('rejette un payload valide sans signature', async () => {
    const { sessionToken } = await (await login(ENV.AUTH_USERNAME, ENV.AUTH_PASSWORD)).json() as LoginBody;
    expect((await appelAuthentifie(sessionToken.split('.')[0])).status).toBe(401);
  });

  it('rejette une signature invalide', async () => {
    const { sessionToken } = await (await login(ENV.AUTH_USERNAME, ENV.AUTH_PASSWORD)).json() as LoginBody;
    const wrong = `${sessionToken.split('.')[0]}.${btoa('signature-bidon')}`;
    expect((await appelAuthentifie(wrong)).status).toBe(401);
  });

  it('rejette un payload retouché avec une signature recyclée', async () => {
    const { sessionToken } = await (await login(ENV.AUTH_USERNAME, ENV.AUTH_PASSWORD)).json() as LoginBody;
    const tampered = btoa(JSON.stringify({ token: 'x', expiresAt: 9999999999999 }));
    expect((await appelAuthentifie(`${tampered}.${sessionToken.split('.')[1]}`)).status).toBe(401);
  });

  it('rejette un jeton signé avec un autre secret', async () => {
    const other = { ...ENV, SESSION_SECRET: 'un-autre-secret' };
    const { sessionToken } = await (await login(ENV.AUTH_USERNAME, ENV.AUTH_PASSWORD, ORIGIN, other)).json() as LoginBody;
    expect((await appelAuthentifie(sessionToken)).status).toBe(401);
  });

  it('rejette l’absence de jeton', async () => {
    expect((await appelAuthentifie('')).status).toBe(401);
  });
});

describe('repli sur AUTH_PASSWORD', () => {
  it('permet de se connecter même sans SESSION_SECRET', async () => {
    const env = { ...ENV, SESSION_SECRET: undefined };
    const res = await login(ENV.AUTH_USERNAME, ENV.AUTH_PASSWORD, ORIGIN, env);
    expect(res.status).toBe(200);
    const { sessionToken } = await res.json() as LoginBody;
    expect((await appelAuthentifie(sessionToken, env)).status).toBe(200);
  });
});

describe('origine unique — plus aucun CORS', () => {
  /**
   * Le front est servi sur la MÊME origine que cette API (SPEC §1.2) : la
   * route /api/* de wrangler.toml capte les appels avant Pages. Il n'y a donc
   * plus d'en-têtes CORS à émettre, ni de liste d'origines à tenir à jour.
   *
   * Ce test verrouille l'absence : réintroduire un middleware CORS « au cas
   * où » ferait silencieusement revenir la liste d'origines qu'on vient de
   * supprimer, avec le piège d'entretien qui va avec.
   */
  it('n’émet aucun en-tête Access-Control, quelle que soit l’origine', async () => {
    for (const origin of [ORIGIN, 'https://site-malveillant.example']) {
      const res = await login(ENV.AUTH_USERNAME, ENV.AUTH_PASSWORD, origin);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(res.headers.get('Access-Control-Allow-Methods')).toBeNull();
    }
  });

  it('ne répond plus au préflight : il n’y en a plus', async () => {
    const res = await worker.fetch(
      new Request('https://w.dev/api/contents', { method: 'OPTIONS', headers: { Origin: ORIGIN } }),
      ENV
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
