/**
 * Worker — jeton de session signé et CORS.
 *
 * Ce que ces tests protègent : avant le 16/08/2026, verifySessionToken se
 * contentait de décoder du base64. WORKER_URL étant en clair dans le bundle
 * public, n'importe qui pouvait fabriquer un jeton et obtenir un accès complet
 * en lecture ET écriture sur Notion. Les cas « tokens forgés » ci-dessous sont
 * la garantie que ce trou ne se rouvre pas.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
// @ts-ignore — le Worker est du JS sans types
import worker from '../src/index';

const ENV = {
  AUTH_USERNAME: 'florent',
  AUTH_PASSWORD: 'motdepasse-de-test',
  SESSION_SECRET: 'secret-de-signature-de-test',
  NOTION_API_KEY: 'notion-key',
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

const callNotion = (token: string | null, env: any = ENV) =>
  worker.fetch(new Request('https://w.dev/v1/databases/abc', {
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
  // Toute requête sortante (Notion / 1min) est neutralisée
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

describe('accès au proxy', () => {
  it('accepte un jeton légitime', async () => {
    const { sessionToken } = await (await login(ENV.AUTH_USERNAME, ENV.AUTH_PASSWORD)).json() as LoginBody;
    expect((await callNotion(sessionToken)).status).toBe(200);
  });

  it('rejette un jeton expiré, pourtant correctement signé', async () => {
    const payload = btoa(JSON.stringify({ token: 'x', expiresAt: Date.now() - 1000 }));
    const token = `${payload}.${await signPayload(payload)}`;
    expect((await callNotion(token)).status).toBe(401);
  });
});

describe('jetons forgés — le trou d’avant', () => {
  it('rejette l’ancien format non signé', async () => {
    const oldStyle = btoa(JSON.stringify({ token: 'x', expiresAt: 9999999999999 }));
    expect((await callNotion(oldStyle)).status).toBe(401);
  });

  it('rejette un payload valide sans signature', async () => {
    const { sessionToken } = await (await login(ENV.AUTH_USERNAME, ENV.AUTH_PASSWORD)).json() as LoginBody;
    expect((await callNotion(sessionToken.split('.')[0])).status).toBe(401);
  });

  it('rejette une signature invalide', async () => {
    const { sessionToken } = await (await login(ENV.AUTH_USERNAME, ENV.AUTH_PASSWORD)).json() as LoginBody;
    const wrong = `${sessionToken.split('.')[0]}.${btoa('signature-bidon')}`;
    expect((await callNotion(wrong)).status).toBe(401);
  });

  it('rejette un payload retouché avec une signature recyclée', async () => {
    const { sessionToken } = await (await login(ENV.AUTH_USERNAME, ENV.AUTH_PASSWORD)).json() as LoginBody;
    const tampered = btoa(JSON.stringify({ token: 'x', expiresAt: 9999999999999 }));
    expect((await callNotion(`${tampered}.${sessionToken.split('.')[1]}`)).status).toBe(401);
  });

  it('rejette un jeton signé avec un autre secret', async () => {
    const other = { ...ENV, SESSION_SECRET: 'un-autre-secret' };
    const { sessionToken } = await (await login(ENV.AUTH_USERNAME, ENV.AUTH_PASSWORD, ORIGIN, other)).json() as LoginBody;
    expect((await callNotion(sessionToken)).status).toBe(401);
  });

  it('rejette l’absence de jeton', async () => {
    expect((await callNotion('')).status).toBe(401);
  });
});

describe('repli sur AUTH_PASSWORD', () => {
  it('permet de se connecter même sans SESSION_SECRET', async () => {
    const env = { ...ENV, SESSION_SECRET: undefined };
    const res = await login(ENV.AUTH_USERNAME, ENV.AUTH_PASSWORD, ORIGIN, env);
    expect(res.status).toBe(200);
    const { sessionToken } = await res.json() as LoginBody;
    expect((await callNotion(sessionToken, env)).status).toBe(200);
  });
});

describe('CORS', () => {
  it('autorise l’origine de production', async () => {
    const res = await login(ENV.AUTH_USERNAME, ENV.AUTH_PASSWORD, ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  it('autorise le serveur de dev', async () => {
    const res = await login(ENV.AUTH_USERNAME, ENV.AUTH_PASSWORD, 'http://localhost:7860');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:7860');
  });

  it('n’envoie aucun en-tête ACAO à une origine inconnue', async () => {
    const res = await login(ENV.AUTH_USERNAME, ENV.AUTH_PASSWORD, 'https://site-malveillant.example');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('répond au préflight OPTIONS', async () => {
    const res = await worker.fetch(new Request('https://w.dev/v1/pages', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), ENV);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });
});
