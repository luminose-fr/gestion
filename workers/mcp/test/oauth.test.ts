/**
 * La couche A, de bout en bout : Claude s'enregistre, Florent consent, Google
 * certifie l'adresse, Claude échange le code, puis rafraîchit.
 *
 * Le cas qui compte le plus est le moins spectaculaire : une autre adresse
 * Google va au bout du parcours chez Google, et repart les mains vides.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { base64url, empreinte, signer, verifier } from '../src/crypto';
import { ADRESSE, ORIGINE, appeler, creerEnv, requeteModerne, simulerFetch } from './aides';
import type { Env } from '../src/env';

afterEach(() => { vi.unstubAllGlobals(); });

const CLAUDE = 'https://claude.ai/api/mcp/auth_callback';
const JETON_GOOGLE = 'https://oauth2.googleapis.com/token';

/** Un jeton d'identité Google : la signature n'est pas vérifiée (voir oauth.ts), les revendications si. */
const jetonIdentite = (revendications: Record<string, unknown>) => {
  const encoder = (o: unknown) => base64url(new TextEncoder().encode(JSON.stringify(o)));
  return `${encoder({ alg: 'RS256' })}.${encoder({
    iss: 'https://accounts.google.com',
    aud: 'client-google.apps.googleusercontent.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: ADRESSE,
    email_verified: true,
    ...revendications,
  })}.signature`;
};

const inscrire = async (env: Env, redirect_uris = [CLAUDE], client_name = 'Claude') => {
  const reponse = await appeler(env, '/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name, redirect_uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'] }),
  });
  return { reponse, corps: await reponse.json() as any };
};

const VERIFICATEUR = 'verificateur-pkce-de-claude-assez-long-pour-la-rfc-7636';

const demande = async (clientId: string, surcharges: Record<string, string | null> = {}) => {
  const q = new URLSearchParams();
  const params: Record<string, string | null> = {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: CLAUDE,
    code_challenge: await empreinte(VERIFICATEUR),
    code_challenge_method: 'S256',
    state: 'etat-de-claude',
    resource: `${ORIGINE}/mcp`,
    ...surcharges,
  };
  for (const [cle, valeur] of Object.entries(params)) if (valeur !== null) q.set(cle, valeur);
  return `/authorize?${q}`;
};

const formulaire = (cookie: string, n: string) => ({
  method: 'POST',
  headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ n }).toString(),
});

/**
 * Le parcours du navigateur jusqu'au retour de Google. `identite` est ce que
 * Google répondra à l'échange du code.
 */
const connecter = async (env: Env, identite: Record<string, unknown> = {}, options: { clientId?: string; retour?: string } = {}) => {
  const clientId = options.clientId ?? (await inscrire(env)).corps.client_id;
  const consentement = await appeler(env, await demande(clientId, options.retour ? { redirect_uri: options.retour } : {}));
  const cookie = consentement.headers.get('Set-Cookie')!.split(';')[0];
  const n = /name="n" value="([^"]+)"/.exec(await consentement.text())![1];

  const versGoogle = await appeler(env, '/authorize', formulaire(cookie, n));
  const google = new URL(versGoogle.headers.get('Location')!);

  const appels = simulerFetch(({ url }) => (url === JETON_GOOGLE ? Response.json({ id_token: jetonIdentite(identite) }) : undefined));
  const retour = await appeler(env, `/callback?code=code-google&state=${google.searchParams.get('state')}`, { headers: { Cookie: cookie } });
  return { clientId, cookie, google, retour, appels };
};

const echanger = (env: Env, params: Record<string, string>) => appeler(env, '/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(params).toString(),
});

const codeDe = (retour: Response) => new URL(retour.headers.get('Location')!).searchParams.get('code')!;

describe('métadonnées', () => {
  it('désignent la ressource /mcp et ce serveur comme serveur d’autorisation', async () => {
    const env = creerEnv();
    for (const chemin of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
      const reponse = await appeler(env, chemin);
      expect(reponse.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(await reponse.json()).toEqual({
        resource: `${ORIGINE}/mcp`,
        authorization_servers: [ORIGINE],
        bearer_methods_supported: ['header'],
        resource_name: 'Luminose — Google Ads (lecture seule)',
      });
    }
  });

  it('annoncent PKCE S256, les clients publics et le paramètre iss', async () => {
    const corps = await (await appeler(creerEnv(), '/.well-known/oauth-authorization-server')).json() as any;
    expect(corps.issuer).toBe(ORIGINE);
    expect(corps.registration_endpoint).toBe(`${ORIGINE}/register`);
    expect(corps.code_challenge_methods_supported).toEqual(['S256']);
    expect(corps.token_endpoint_auth_methods_supported).toEqual(['none']);
    expect(corps.authorization_response_iss_parameter_supported).toBe(true);
  });
});

describe('enregistrement dynamique', () => {
  it('accepte le retour de Claude et les boucles locales, sans rien écrire', async () => {
    const env = creerEnv();
    const claude = await inscrire(env);
    expect(claude.reponse.status).toBe(201);
    expect(claude.corps.token_endpoint_auth_method).toBe('none');
    expect(claude.corps.redirect_uris).toEqual([CLAUDE]);
    expect(claude.corps.client_secret).toBeUndefined();

    const local = await inscrire(env, ['http://localhost:6274/oauth/callback', 'http://127.0.0.1/callback'], 'Claude Code');
    expect(local.reponse.status).toBe(201);

    // L'identifiant porte l'inscription : un robot qui martèle /register ne remplit rien.
    expect(env.OAUTH_KV.entrees.size).toBe(0);
  });

  it('refuse toute autre adresse de retour', async () => {
    const env = creerEnv();
    for (const retour of [
      'https://evil.example/callback', 'https://claude.ai/api/mcp/auth_callback/../evil', 'https://claude.ai.evil.example/api/mcp/auth_callback',
      'http://claude.ai/api/mcp/auth_callback', 'https://localhost/callback', 'javascript:alert(1)', 'http://localhost:1/#x',
    ]) {
      const { reponse, corps } = await inscrire(env, [CLAUDE, retour]);
      expect(reponse.status, retour).toBe(400);
      expect(corps.error).toBe('invalid_redirect_uri');
    }
  });

  it('refuse les types d’octroi qu’il ne sert pas', async () => {
    const reponse = await appeler(creerEnv(), '/register', {
      method: 'POST', body: JSON.stringify({ redirect_uris: [CLAUDE], grant_types: ['client_credentials'] }),
    });
    expect(reponse.status).toBe(400);
    expect((await reponse.json() as any).error).toBe('invalid_client_metadata');
  });
});

describe('autorisation', () => {
  it('ne redirige nulle part tant que le client et son retour ne sont pas établis', async () => {
    const env = creerEnv();
    const { client_id } = (await inscrire(env)).corps;

    const inconnu = await appeler(env, await demande('client-invente'));
    expect(inconnu.status).toBe(400);
    expect(inconnu.headers.get('Location')).toBeNull();

    // Un identifiant altéré d'un caractère ne passe pas la signature.
    const altere = client_id.slice(0, 10) + (client_id[10] === 'A' ? 'B' : 'A') + client_id.slice(11);
    expect((await appeler(env, await demande(altere))).status).toBe(400);

    const retourEtranger = await appeler(env, await demande(client_id, { redirect_uri: 'https://evil.example/callback' }));
    expect(retourEtranger.status).toBe(400);
    expect(retourEtranger.headers.get('Location')).toBeNull();
  });

  it('exige PKCE S256, et le dit à Claude par son adresse de retour', async () => {
    const env = creerEnv();
    const { client_id } = (await inscrire(env)).corps;
    for (const surcharges of [{ code_challenge: null }, { code_challenge_method: 'plain' }] as Record<string, string | null>[]) {
      const reponse = await appeler(env, await demande(client_id, surcharges));
      expect(reponse.status).toBe(302);
      const retour = new URL(reponse.headers.get('Location')!);
      expect(retour.origin + retour.pathname).toBe(CLAUDE);
      expect(retour.searchParams.get('error')).toBe('invalid_request');
      expect(retour.searchParams.get('state')).toBe('etat-de-claude');
      expect(retour.searchParams.get('iss')).toBe(ORIGINE);
    }
  });

  it('refuse un jeton demandé pour une autre ressource', async () => {
    const env = creerEnv();
    const { client_id } = (await inscrire(env)).corps;
    const reponse = await appeler(env, await demande(client_id, { resource: 'https://autre.example/mcp' }));
    expect(new URL(reponse.headers.get('Location')!).searchParams.get('error')).toBe('invalid_target');
  });

  it('affiche un consentement qui nomme le client et l’hôte de retour, et qu’on ne peut pas encadrer', async () => {
    const env = creerEnv();
    const { client_id } = (await inscrire(env, [CLAUDE], '<script>alert(1)</script>')).corps;
    const reponse = await appeler(env, await demande(client_id));

    expect(reponse.status).toBe(200);
    const html = await reponse.text();
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<strong>claude.ai</strong>');
    expect(html).not.toMatch(/adresse de retour est locale/);
    expect(reponse.headers.get('Content-Security-Policy')).toMatch(/frame-ancestors 'none'/);

    const cookie = reponse.headers.get('Set-Cookie')!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Secure/);
    // Rien d'écrit avant que Google ait parlé.
    expect(env.OAUTH_KV.entrees.size).toBe(0);
  });

  it('signale une boucle locale, et en ignore le port', async () => {
    const env = creerEnv();
    const { client_id } = (await inscrire(env, ['http://localhost/callback'], 'Claude Code')).corps;
    const reponse = await appeler(env, await demande(client_id, { redirect_uri: 'http://localhost:3118/callback' }));
    expect(reponse.status).toBe(200);
    const html = await reponse.text();
    expect(html).toContain('<strong>localhost:3118</strong>');
    expect(html).toMatch(/adresse de retour est locale/);

    // Le port, oui ; le chemin, non.
    const autreChemin = await appeler(env, await demande(client_id, { redirect_uri: 'http://localhost:3118/ailleurs' }));
    expect(autreChemin.status).toBe(400);
  });

  it('part chez Google avec PKCE, sans demander autre chose que l’identité', async () => {
    const env = creerEnv();
    const { google } = await connecter(env);
    expect(google.origin + google.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(google.searchParams.get('client_id')).toBe('client-google.apps.googleusercontent.com');
    expect(google.searchParams.get('redirect_uri')).toBe(`${ORIGINE}/callback`);
    expect(google.searchParams.get('scope')).toBe('openid email');
    expect(google.searchParams.get('code_challenge_method')).toBe('S256');
    expect(google.searchParams.get('code_challenge')).toBeTruthy();
  });

  it('refuse le bouton du consentement sans le cookie de ce navigateur', async () => {
    const env = creerEnv();
    const { client_id } = (await inscrire(env)).corps;
    const consentement = await appeler(env, await demande(client_id));
    const cookie = consentement.headers.get('Set-Cookie')!.split(';')[0];
    const n = /name="n" value="([^"]+)"/.exec(await consentement.text())![1];

    expect((await appeler(env, '/authorize', formulaire('', n))).status).toBe(400);
    expect((await appeler(env, '/authorize', formulaire(cookie, 'autre'))).status).toBe(400);
    // Un identifiant de client ne se fait pas passer pour un cookie de connexion.
    expect((await appeler(env, '/authorize', formulaire(`mcp_connexion=${client_id}`, n))).status).toBe(400);
  });

  it('refuse un retour de Google qui n’appartient pas à ce navigateur', async () => {
    const env = creerEnv();
    simulerFetch();
    const sansCookie = await appeler(env, '/callback?code=x&state=y');
    expect(sansCookie.status).toBe(400);
    expect(sansCookie.headers.get('Location')).toBeNull();
    expect(env.OAUTH_KV.entrees.size).toBe(0);
  });
});

describe('liste d’autorisation — couche A', () => {
  it('une identité hors ALLOWED_EMAIL n’obtient pas de jeton', async () => {
    const env = creerEnv();
    const { retour } = await connecter(env, { email: 'stagiaire@luminose.fr' });

    expect(retour.status).toBe(403);
    expect(retour.headers.get('Location')).toBeNull();
    expect(await retour.text()).toMatch(/stagiaire@luminose\.fr n&#39;est pas autorisée/);
    // Aucun code, aucun jeton : la base est restée vide.
    expect(env.OAUTH_KV.entrees.size).toBe(0);
  });

  it('ni une adresse que Google n’a pas vérifiée', async () => {
    const env = creerEnv();
    const { retour } = await connecter(env, { email_verified: false });
    expect(retour.status).toBe(403);
    expect(env.OAUTH_KV.entrees.size).toBe(0);
  });

  it('ni personne, si ALLOWED_EMAIL n’est pas posé', async () => {
    const env = creerEnv({ ALLOWED_EMAIL: undefined });
    const { retour } = await connecter(env);
    expect(retour.status).toBe(403);
    expect(env.OAUTH_KV.entrees.size).toBe(0);
  });

  it('refuse un jeton d’identité émis pour un autre client, ou expiré', async () => {
    for (const revendications of [{ aud: 'autre-client' }, { iss: 'https://evil.example' }, { exp: 1 }]) {
      const env = creerEnv();
      const { retour } = await connecter(env, revendications);
      expect(retour.status, JSON.stringify(revendications)).toBe(400);
      expect(env.OAUTH_KV.entrees.size).toBe(0);
    }
  });

  it('compare les adresses sans tenir compte de la casse', async () => {
    const env = creerEnv();
    const { retour } = await connecter(env, { email: 'Florent@Luminose.fr' });
    expect(retour.status).toBe(302);
  });
});

describe('jetons', () => {
  it('parcours complet : code, jeton, appel MCP, rafraîchissement avec rotation', async () => {
    const env = creerEnv();
    const { clientId, retour, appels } = await connecter(env);

    // Retour chez Claude : code, state d'origine, émetteur (RFC 9207).
    expect(retour.status).toBe(302);
    const versClaude = new URL(retour.headers.get('Location')!);
    expect(versClaude.origin + versClaude.pathname).toBe(CLAUDE);
    expect(versClaude.searchParams.get('state')).toBe('etat-de-claude');
    expect(versClaude.searchParams.get('iss')).toBe(ORIGINE);
    expect(retour.headers.get('Set-Cookie')).toMatch(/Max-Age=0/);

    // L'échange avec Google porte notre vérificateur PKCE et notre secret.
    const echange = new URLSearchParams(appels.find((a) => a.url === JETON_GOOGLE)!.corps);
    expect(echange.get('redirect_uri')).toBe(`${ORIGINE}/callback`);
    expect(echange.get('code_verifier')).toBeTruthy();
    expect(echange.get('client_secret')).toBe('secret-google');

    const code = codeDe(retour);
    const jetons = await echanger(env, {
      grant_type: 'authorization_code', code, code_verifier: VERIFICATEUR, client_id: clientId,
      redirect_uri: CLAUDE, resource: `${ORIGINE}/mcp`,
    });
    expect(jetons.status).toBe(200);
    expect(jetons.headers.get('Cache-Control')).toBe('no-store');
    const { access_token, refresh_token, token_type, expires_in } = await jetons.json() as any;
    expect(token_type).toBe('Bearer');
    expect(expires_in).toBe(3600);

    // Rien n'est rangé en clair : seules les empreintes servent de clés.
    const cles = [...env.OAUTH_KV.entrees.keys()].join(' ');
    expect(cles).not.toContain(access_token);
    expect(cles).not.toContain(refresh_token);

    const liste = await appeler(env, '/mcp', requeteModerne(access_token, 'tools/list'));
    expect(liste.status).toBe(200);

    // Le code ne sert qu'une fois.
    const rejeu = await echanger(env, { grant_type: 'authorization_code', code, code_verifier: VERIFICATEUR, client_id: clientId });
    expect(rejeu.status).toBe(400);
    expect((await rejeu.json() as any).error).toBe('invalid_grant');

    // Rafraîchissement : un nouveau couple, et l'ancien jeton de rafraîchissement meurt.
    const rafraichi = await echanger(env, { grant_type: 'refresh_token', refresh_token, client_id: clientId });
    expect(rafraichi.status).toBe(200);
    const nouveaux = await rafraichi.json() as any;
    expect(nouveaux.refresh_token).not.toBe(refresh_token);
    expect((await appeler(env, '/mcp', requeteModerne(nouveaux.access_token, 'tools/list'))).status).toBe(200);

    const ancien = await echanger(env, { grant_type: 'refresh_token', refresh_token, client_id: clientId });
    expect(ancien.status).toBe(400);
    expect((await ancien.json() as any).error).toBe('invalid_grant');
  });

  it('refuse un vérificateur PKCE qui ne correspond pas', async () => {
    const env = creerEnv();
    const { clientId, retour } = await connecter(env);
    const reponse = await echanger(env, { grant_type: 'authorization_code', code: codeDe(retour), code_verifier: 'autre', client_id: clientId });
    expect(reponse.status).toBe(400);
    expect((await reponse.json() as any).error).toBe('invalid_grant');
  });

  it('refuse un code présenté par un autre client', async () => {
    const env = creerEnv();
    const { retour } = await connecter(env);
    const autre = (await inscrire(env)).corps.client_id;
    const reponse = await echanger(env, { grant_type: 'authorization_code', code: codeDe(retour), code_verifier: VERIFICATEUR, client_id: autre });
    expect((await reponse.json() as any).error).toBe('invalid_grant');
  });

  it('refuse un client inconnu et un code expiré', async () => {
    const env = creerEnv();
    const { clientId, retour } = await connecter(env);
    const code = codeDe(retour);

    const inconnu = await echanger(env, { grant_type: 'authorization_code', code, code_verifier: VERIFICATEUR, client_id: 'invente' });
    expect(inconnu.status).toBe(401);
    expect((await inconnu.json() as any).error).toBe('invalid_client');

    vi.useFakeTimers({ now: Date.now() + 61_000 });
    try {
      const expire = await echanger(env, { grant_type: 'authorization_code', code, code_verifier: VERIFICATEUR, client_id: clientId });
      expect((await expire.json() as any).error).toBe('invalid_grant');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ne rafraîchit plus une adresse retirée de la liste', async () => {
    const env = creerEnv();
    const { clientId, retour } = await connecter(env);
    const { refresh_token } = await (await echanger(env, {
      grant_type: 'authorization_code', code: codeDe(retour), code_verifier: VERIFICATEUR, client_id: clientId,
    })).json() as any;

    env.ALLOWED_EMAIL = 'quelquun@luminose.fr';
    const reponse = await echanger(env, { grant_type: 'refresh_token', refresh_token, client_id: clientId });
    expect((await reponse.json() as any).error).toBe('invalid_grant');
  });

  it('refuse les octrois qu’il ne sert pas', async () => {
    const env = creerEnv();
    const { client_id } = (await inscrire(env)).corps;
    const reponse = await echanger(env, { grant_type: 'client_credentials', client_id });
    expect((await reponse.json() as any).error).toBe('unsupported_grant_type');
  });
});

describe('configuration', () => {
  it('nomme le secret absent au lieu de tomber en 500', async () => {
    const env = creerEnv({ OAUTH_SIGNING_KEY: undefined });
    const reponse = await inscrire(env);
    expect(reponse.reponse.status).toBe(503);
    expect(reponse.corps.error_description).toMatch(/OAUTH_SIGNING_KEY/);

    const page = await appeler(env, '/authorize?client_id=x');
    expect(page.status).toBe(503);
    expect(page.headers.get('Content-Type')).toMatch(/text\/html/);
    expect(await page.text()).toMatch(/OAUTH_SIGNING_KEY/);
  });
});

describe('signatures', () => {
  it('la nature fait partie de la signature', async () => {
    const jeton = await signer('client', { r: [CLAUDE] }, 'cle');
    expect(await verifier('client', jeton, 'cle')).toEqual({ r: [CLAUDE] });
    expect(await verifier('connexion', jeton, 'cle')).toBeNull();
    expect(await verifier('client', jeton, 'autre-cle')).toBeNull();
    expect(await verifier('client', `${jeton}x`, 'cle')).toBeNull();
    expect(await verifier('client', 'sans-point', 'cle')).toBeNull();
  });
});
