/**
 * La couche A : @cloudflare/workers-oauth-provider pour le protocole, ce Worker
 * pour l'identification et le consentement.
 *
 * On ne reteste pas la bibliothèque — elle a sa propre suite de conformité.
 * On teste ce qu'on lui a confié (CIMD seul, la ressource /mcp) et ce qu'on
 * a écrit autour : rien n'entre dans KV tant que Google n'a pas certifié
 * l'adresse admise, et une autre adresse repart sans grant ni jeton.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { base64url, empreinte, signer, verifier } from '../src/crypto';
import {
  ADRESSE, CLAUDE, ORIGINE, RESSOURCE, VERIFICATEUR, api, appeler, creerEnv, requeteModerne, simulerFetch,
  type EnvFactice,
} from './aides';

afterEach(() => { vi.unstubAllGlobals(); });

const JETON_GOOGLE = 'https://oauth2.googleapis.com/token';

/** Un client CIMD : son identifiant est l'URL de son document. */
const CLIENT_CIMD = 'https://claude.ai/oauth/client-de-test';

const documentClient = (surcharges: Record<string, unknown> = {}) => ({
  client_id: CLIENT_CIMD,
  client_name: 'Claude',
  redirect_uris: [CLAUDE, 'http://localhost/callback'],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
  ...surcharges,
});

/** Un jeton d'identité Google : la signature n'est pas vérifiée (voir autorisation.ts), les revendications si. */
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

/**
 * Le monde extérieur : le document CIMD du client, et Google. `document` à
 * `null` fait répondre 404 au document.
 */
const simulerExterieur = (options: { document?: Record<string, unknown> | null; identite?: Record<string, unknown> } = {}) =>
  simulerFetch(({ url }) => {
    if (url === CLIENT_CIMD) {
      return options.document === null
        ? new Response('introuvable', { status: 404 })
        : Response.json(options.document ?? documentClient());
    }
    if (url === JETON_GOOGLE) return Response.json({ id_token: jetonIdentite(options.identite ?? {}) });
    return undefined;
  });

const demande = async (surcharges: Record<string, string | null> = {}) => {
  const params: Record<string, string | null> = {
    response_type: 'code',
    client_id: CLIENT_CIMD,
    redirect_uri: CLAUDE,
    code_challenge: await empreinte(VERIFICATEUR),
    code_challenge_method: 'S256',
    state: 'etat-de-claude',
    resource: RESSOURCE,
    ...surcharges,
  };
  const q = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(params)) if (valeur !== null) q.set(cle, valeur);
  return `/authorize?${q}`;
};

const formulaire = (cookie: string, n: string) => ({
  method: 'POST',
  headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ n }).toString(),
});

/** Le parcours du navigateur, du consentement au retour de Google. */
const connecter = async (
  env: EnvFactice,
  options: { identite?: Record<string, unknown>; clientId?: string; retour?: string } = {},
) => {
  const appels = simulerExterieur({ identite: options.identite });
  const consentement = await appeler(env, await demande({
    ...(options.clientId ? { client_id: options.clientId } : {}),
    ...(options.retour ? { redirect_uri: options.retour } : {}),
  }));
  expect(consentement.status).toBe(200);
  const cookie = consentement.headers.get('Set-Cookie')!.split(';')[0];
  const html = await consentement.text();
  const n = /name="n" value="([^"]+)"/.exec(html)![1];

  const versGoogle = await appeler(env, '/authorize', formulaire(cookie, n));
  const google = new URL(versGoogle.headers.get('Location')!);
  const retour = await appeler(env, `/callback?code=code-google&state=${google.searchParams.get('state')}`, { headers: { Cookie: cookie } });
  return { html, cookie, n, google, retour, appels };
};

const echanger = (env: EnvFactice, params: Record<string, string>) => appeler(env, '/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(params).toString(),
});

const codeDe = (retour: Response) => new URL(retour.headers.get('Location')!).searchParams.get('code')!;

const clesDe = (env: EnvFactice) => [...env.OAUTH_KV.entrees.keys()];

describe('ce que la bibliothèque annonce', () => {
  it('CIMD, clients publics, et pas d’enregistrement dynamique — ce qui fait choisir CIMD à Claude', async () => {
    const env = creerEnv();
    const serveur = await (await appeler(env, '/.well-known/oauth-authorization-server')).json() as any;
    expect(serveur.client_id_metadata_document_supported).toBe(true);
    expect(serveur.token_endpoint_auth_methods_supported).toContain('none');
    expect(serveur.registration_endpoint).toBeUndefined();
    expect(serveur.code_challenge_methods_supported).toEqual(['S256']);
    expect(serveur.authorization_response_iss_parameter_supported).toBe(true);
    expect((await appeler(env, '/register', { method: 'POST', body: '{}' })).status).toBe(404);
  });

  it('la ressource est l’URL canonique de /mcp', async () => {
    const ressource = await (await appeler(creerEnv(), '/.well-known/oauth-protected-resource/mcp')).json() as any;
    expect(ressource.resource).toBe('https://mcp.luminose.fr/mcp');
    expect(ressource.authorization_servers).toEqual([ORIGINE]);
  });
});

describe('NORMATIF — aucune écriture KV sur une requête non authentifiée', () => {
  it('ni la découverte, ni /mcp, ni /token, ni le consentement, ni un retour Google refusé n’écrivent', async () => {
    const env = creerEnv();
    const inconnu = 'https://claude.ai/oauth/client-inconnu';

    // Découverte, préflight, enregistrement désactivé.
    await appeler(env, '/.well-known/oauth-authorization-server');
    await appeler(env, '/.well-known/oauth-protected-resource/mcp');
    await appeler(env, '/mcp', { method: 'OPTIONS', headers: { Origin: 'http://localhost:6274' } });
    await appeler(env, '/register', { method: 'POST', body: JSON.stringify({ redirect_uris: [CLAUDE] }) });

    // /mcp sans jeton, avec un jeton inventé.
    await appeler(env, '/mcp', requeteModerne('', 'tools/list'));
    await appeler(env, '/mcp', requeteModerne('utilisateur:grant:secret', 'tools/list'));

    // /token avec n'importe quoi.
    await echanger(env, { grant_type: 'authorization_code', code: 'a:b:c', code_verifier: VERIFICATEUR, client_id: CLIENT_CIMD, redirect_uri: CLAUDE });
    await echanger(env, { grant_type: 'refresh_token', refresh_token: 'a:b:c', client_id: CLIENT_CIMD });
    await echanger(env, { grant_type: 'authorization_code', code: 'x', client_id: 'client-invente' });

    // Le consentement et le départ chez Google, pour un client connu comme inconnu.
    simulerFetch(({ url }) => (url === CLIENT_CIMD ? Response.json(documentClient()) : url === inconnu ? new Response('', { status: 404 }) : undefined));
    await appeler(env, await demande({ client_id: inconnu }));
    await appeler(env, await demande({ client_id: 'client-invente' }));
    await appeler(env, await demande({ code_challenge: null }));
    const consentement = await appeler(env, await demande());
    const cookie = consentement.headers.get('Set-Cookie')!.split(';')[0];
    const n = /name="n" value="([^"]+)"/.exec(await consentement.text())![1];
    await appeler(env, '/authorize', formulaire(cookie, n));
    await appeler(env, '/authorize', formulaire('', n));

    // Des retours Google qui n'aboutissent pas.
    await appeler(env, '/callback?code=x&state=y');
    await appeler(env, `/callback?error=access_denied&state=${n}`, { headers: { Cookie: cookie } });
    for (const identite of [{ email: 'stagiaire@luminose.fr' }, { email_verified: false }, { aud: 'autre-client' }]) {
      simulerExterieur({ identite });
      await appeler(env, `/callback?code=code-google&state=${n}`, { headers: { Cookie: cookie } });
    }

    expect(env.OAUTH_KV.ecritures).toEqual([]);

    // Le témoin : l'adresse admise, elle, écrit — le test sait voir une écriture.
    simulerExterieur();
    await appeler(env, `/callback?code=code-google&state=${n}`, { headers: { Cookie: cookie } });
    expect(env.OAUTH_KV.ecritures.some((e) => e.startsWith('put grant:'))).toBe(true);
  });
});

describe('liste d’autorisation — une adresse hors liste n’obtient ni grant ni jeton', () => {
  const sansGrantNiJeton = (env: EnvFactice) =>
    expect(clesDe(env).filter((cle) => /^(grant|token):/.test(cle))).toEqual([]);

  it('une autre adresse du domaine', async () => {
    const env = creerEnv();
    const { retour } = await connecter(env, { identite: { email: 'stagiaire@luminose.fr' } });

    expect(retour.status).toBe(403);
    expect(retour.headers.get('Location')).toBeNull();
    expect(await retour.text()).toMatch(/stagiaire@luminose\.fr n&#39;est pas autorisée/);
    sansGrantNiJeton(env);
  });

  it('une adresse que Google n’a pas vérifiée', async () => {
    const env = creerEnv();
    const { retour } = await connecter(env, { identite: { email_verified: false } });
    expect(retour.status).toBe(403);
    sansGrantNiJeton(env);
  });

  it('personne, si ALLOWED_EMAIL n’est pas posé', async () => {
    const env = creerEnv({ ALLOWED_EMAIL: undefined });
    const { retour } = await connecter(env);
    expect(retour.status).toBe(403);
    sansGrantNiJeton(env);
  });

  it('un jeton d’identité émis pour un autre client, par un autre émetteur, ou expiré', async () => {
    for (const identite of [{ aud: 'autre-client' }, { iss: 'https://evil.example' }, { exp: 1 }]) {
      const env = creerEnv();
      const { retour } = await connecter(env, { identite });
      expect(retour.status, JSON.stringify(identite)).toBe(400);
      expect(retour.headers.get('Location')).toBeNull();
      sansGrantNiJeton(env);
    }
  });

  it('l’adresse admise, sans tenir compte de la casse', async () => {
    const env = creerEnv();
    const { retour } = await connecter(env, { identite: { email: 'Florent@Luminose.fr' } });
    expect(retour.status).toBe(302);
  });
});

describe('/authorize', () => {
  it('ne redirige nulle part pour un client qu’on ne peut pas vérifier', async () => {
    const env = creerEnv();
    simulerExterieur({ document: null });
    const cimd = await appeler(env, await demande());
    expect(cimd.status).toBe(400);
    expect(cimd.headers.get('Location')).toBeNull();
    expect(await cimd.text()).toMatch(/Client non vérifiable/);

    const inconnu = await appeler(env, await demande({ client_id: 'client-invente' }));
    expect(inconnu.status).toBe(400);
    expect(inconnu.headers.get('Location')).toBeNull();
  });

  it('ne redirige nulle part vers une adresse absente du document du client', async () => {
    const env = creerEnv();
    simulerExterieur();
    const reponse = await appeler(env, await demande({ redirect_uri: 'https://evil.example/callback' }));
    expect(reponse.status).toBe(400);
    expect(reponse.headers.get('Location')).toBeNull();
  });

  it('renvoie à Claude, par son adresse validée, ce qui cloche dans sa demande', async () => {
    const env = creerEnv();
    simulerExterieur();
    const reponse = await appeler(env, await demande({ code_challenge: null }));
    expect(reponse.status).toBe(302);
    const retour = new URL(reponse.headers.get('Location')!);
    expect(retour.origin + retour.pathname).toBe(CLAUDE);
    expect(retour.searchParams.get('error')).toBe('invalid_request');
    expect(retour.searchParams.get('state')).toBe('etat-de-claude');
    expect(retour.searchParams.get('iss')).toBe(ORIGINE);
  });

  it('affiche un consentement qui nomme le client, son domaine et l’hôte de retour, et qu’on ne peut pas encadrer', async () => {
    const env = creerEnv();
    simulerExterieur({ document: documentClient({ client_name: '<script>alert(1)</script>' }) });
    const reponse = await appeler(env, await demande());

    expect(reponse.status).toBe(200);
    const html = await reponse.text();
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Client publié par <strong>claude.ai</strong>');
    expect(html).toContain("l'accès sera envoyé à <strong>claude.ai</strong>");
    expect(html).not.toMatch(/adresse de retour est locale/);
    expect(reponse.headers.get('Content-Security-Policy')).toMatch(/frame-ancestors 'none'/);

    const cookie = reponse.headers.get('Set-Cookie')!;
    expect(cookie).toMatch(/^__Host-mcp-connexion=/);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it('signale une boucle locale, dont le port change à chaque session de Claude Code', async () => {
    const env = creerEnv();
    simulerExterieur();
    const reponse = await appeler(env, await demande({ redirect_uri: 'http://localhost:3118/callback' }));
    expect(reponse.status).toBe(200);
    const html = await reponse.text();
    expect(html).toContain('<strong>localhost</strong>');
    expect(html).toMatch(/adresse de retour est locale/);
  });

  it('part chez Google pour l’identité seulement, avec PKCE', async () => {
    const env = creerEnv();
    const { google, n } = await connecter(env);
    expect(google.origin + google.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(google.searchParams.get('client_id')).toBe('client-google.apps.googleusercontent.com');
    expect(google.searchParams.get('redirect_uri')).toBe(`${ORIGINE}/callback`);
    expect(google.searchParams.get('scope')).toBe('openid email');
    expect(google.searchParams.get('code_challenge_method')).toBe('S256');
    expect(google.searchParams.get('state')).toBe(n);
  });

  it('refuse le bouton du consentement sans le cookie de ce navigateur', async () => {
    const env = creerEnv();
    simulerExterieur();
    const consentement = await appeler(env, await demande());
    const cookie = consentement.headers.get('Set-Cookie')!.split(';')[0];
    const n = /name="n" value="([^"]+)"/.exec(await consentement.text())![1];

    expect((await appeler(env, '/authorize', formulaire('', n))).status).toBe(400);
    expect((await appeler(env, '/authorize', formulaire(cookie, 'autre'))).status).toBe(400);
    // Un cookie signé avec une autre clé ne passe pas.
    const faux = await signer('connexion', { n, e: Date.now() + 60_000 }, 'autre-cle');
    expect((await appeler(env, '/authorize', formulaire(`__Host-mcp-connexion=${faux}`, n))).status).toBe(400);
  });

  it('renvoie un refus de Google à Claude, sans rien délivrer', async () => {
    const env = creerEnv();
    simulerExterieur();
    const consentement = await appeler(env, await demande());
    const cookie = consentement.headers.get('Set-Cookie')!.split(';')[0];
    const n = /name="n" value="([^"]+)"/.exec(await consentement.text())![1];

    const reponse = await appeler(env, `/callback?error=access_denied&state=${n}`, { headers: { Cookie: cookie } });
    expect(reponse.status).toBe(302);
    const retour = new URL(reponse.headers.get('Location')!);
    expect(retour.origin + retour.pathname).toBe(CLAUDE);
    expect(retour.searchParams.get('error')).toBe('access_denied');
    expect(retour.searchParams.get('state')).toBe('etat-de-claude');
    expect(retour.searchParams.get('code')).toBeNull();
  });

  it('nomme le secret absent au lieu de tomber en 500', async () => {
    const env = creerEnv({ COOKIE_SIGNING_KEY: undefined });
    const appels = simulerExterieur();
    const reponse = await appeler(env, await demande());
    expect(reponse.status).toBe(503);
    expect(await reponse.text()).toMatch(/COOKIE_SIGNING_KEY/);
    // Vérifié avant d'aller chercher le document du client.
    expect(appels).toEqual([]);
  });
});

describe('parcours complet', () => {
  it('Claude par CIMD : code, jeton, appel MCP, rafraîchissement', async () => {
    const env = creerEnv();
    const { retour, appels } = await connecter(env);

    // Retour chez Claude : code, state d'origine, émetteur (RFC 9207), cookie effacé.
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
      grant_type: 'authorization_code', code, code_verifier: VERIFICATEUR, client_id: CLIENT_CIMD,
      redirect_uri: CLAUDE, resource: RESSOURCE,
    });
    expect(jetons.status).toBe(200);
    const { access_token, refresh_token } = await jetons.json() as any;
    expect((await appeler(env, '/mcp', requeteModerne(access_token, 'tools/list'))).status).toBe(200);

    const rafraichi = await echanger(env, { grant_type: 'refresh_token', refresh_token, client_id: CLIENT_CIMD });
    expect(rafraichi.status).toBe(200);
    const nouveaux = await rafraichi.json() as any;
    expect(nouveaux.refresh_token).not.toBe(refresh_token);
    expect((await appeler(env, '/mcp', requeteModerne(nouveaux.access_token, 'tools/list'))).status).toBe(200);

    // Le code ne sert qu'une fois — et le présenter de nouveau révoque tout ce
    // qu'il a produit (OAuth 2.1 §4.1.3) : un code volé et rejoué ne laisse
    // aucun jeton valide derrière lui.
    const rejeu = await echanger(env, { grant_type: 'authorization_code', code, code_verifier: VERIFICATEUR, client_id: CLIENT_CIMD, redirect_uri: CLAUDE });
    expect((await rejeu.json() as any).error).toBe('invalid_grant');
    expect((await appeler(env, '/mcp', requeteModerne(nouveaux.access_token, 'tools/list'))).status).toBe(401);
  });

  it('refuse un vérificateur PKCE qui ne correspond pas', async () => {
    const env = creerEnv();
    const { retour } = await connecter(env);
    const reponse = await echanger(env, { grant_type: 'authorization_code', code: codeDe(retour), code_verifier: 'x'.repeat(43), client_id: CLIENT_CIMD, redirect_uri: CLAUDE });
    expect((await reponse.json() as any).error).toBe('invalid_grant');
  });

  it('une adresse retirée de la liste perd /mcp aussitôt, et ne rafraîchit plus', async () => {
    const env = creerEnv();
    const { retour } = await connecter(env);
    const { access_token, refresh_token } = await (await echanger(env, {
      grant_type: 'authorization_code', code: codeDe(retour), code_verifier: VERIFICATEUR, client_id: CLIENT_CIMD, redirect_uri: CLAUDE,
    })).json() as any;

    env.ALLOWED_EMAIL = 'quelquun@luminose.fr';
    const appel = await appeler(env, '/mcp', requeteModerne(access_token, 'tools/list'));
    expect(appel.status).toBe(401);
    expect(appel.headers.get('WWW-Authenticate')).toMatch(/error="invalid_token"/);

    const rafraichi = await echanger(env, { grant_type: 'refresh_token', refresh_token, client_id: CLIENT_CIMD });
    expect((await rafraichi.json() as any).error).toBe('invalid_grant');
  });
});

describe('repli — client préenregistré', () => {
  it('un client créé par createClient() passe, à côté de CIMD', async () => {
    const env = creerEnv();
    const client = await api(env).createClient({
      redirectUris: [CLAUDE], clientName: 'Claude', tokenEndpointAuthMethod: 'none',
    });
    const { html, retour } = await connecter(env, { clientId: client.clientId });
    expect(html).toContain('Client préenregistré sur ce serveur.');
    expect(retour.status).toBe(302);

    const jetons = await echanger(env, {
      grant_type: 'authorization_code', code: codeDe(retour), code_verifier: VERIFICATEUR, client_id: client.clientId, redirect_uri: CLAUDE,
    });
    expect(jetons.status).toBe(200);
  });
});

describe('signatures', () => {
  it('la nature fait partie de la signature', async () => {
    const jeton = await signer('connexion', { n: 'x' }, 'cle');
    expect(await verifier('connexion', jeton, 'cle')).toEqual({ n: 'x' });
    expect(await verifier('autre', jeton, 'cle')).toBeNull();
    expect(await verifier('connexion', jeton, 'autre-cle')).toBeNull();
    expect(await verifier('connexion', `${jeton}x`, 'cle')).toBeNull();
    expect(await verifier('connexion', 'sans-point', 'cle')).toBeNull();
  });
});
