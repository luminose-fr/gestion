/**
 * Un KV de comptoir, un Google de comptoir, et de quoi appeler le Worker.
 */
import { vi } from 'vitest';
import { getOAuthApi } from '@cloudflare/workers-oauth-provider';
import worker, { OPTIONS } from '../src/index';
import { empreinte } from '../src/crypto';
import { oublierJetonAds } from '../src/google-ads';
import { D1Test } from './d1';
import type { Env } from '../src/env';

export const ORIGINE = 'https://mcp.luminose.fr';
export const RESSOURCE = `${ORIGINE}/mcp`;
export const COMPTE = '1234567890';
export const ADRESSE = 'florent@luminose.fr';
export const CLAUDE = 'https://claude.ai/api/mcp/auth_callback';

type Entree = { valeur: string; expire?: number; metadata?: unknown };

/**
 * KV en mémoire, qui respecte `expirationTtl` et les métadonnées de clé — la
 * bibliothèque retrouve les grants d'un utilisateur par `list()` sur leurs
 * métadonnées. Chaque écriture est consignée : c'est ce que vérifie le test
 * « aucune écriture KV avant l'identification ».
 */
export const kvFactice = () => {
  const entrees = new Map<string, Entree>();
  const ecritures: string[] = [];
  const vivante = (e: Entree | undefined) => e && (e.expire === undefined || e.expire > Date.now());
  const kv = {
    entrees,
    ecritures,
    async get(cle: string, type?: string | { type?: string }) {
      const e = entrees.get(cle);
      if (!vivante(e)) return null;
      const t = typeof type === 'string' ? type : type?.type;
      return t === 'json' ? JSON.parse(e!.valeur) : e!.valeur;
    },
    async put(cle: string, valeur: string, options?: { expirationTtl?: number; metadata?: unknown }) {
      ecritures.push(`put ${cle}`);
      entrees.set(cle, {
        valeur,
        expire: options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined,
        metadata: options?.metadata,
      });
    },
    async delete(cle: string) {
      ecritures.push(`delete ${cle}`);
      entrees.delete(cle);
    },
    async list(options: { prefix?: string } = {}) {
      const keys = [...entrees.entries()]
        .filter(([cle, e]) => cle.startsWith(options.prefix ?? '') && vivante(e))
        .map(([name, e]) => ({ name, metadata: e.metadata }));
      return { keys, list_complete: true, cursor: undefined };
    },
  };
  return kv as typeof kv & KVNamespace;
};

export type EnvFactice = Env & { OAUTH_KV: ReturnType<typeof kvFactice>; DB: D1Test & D1Database };

export const LIRE_ECRIRE = ['ads:lire', 'ads:ecrire'];

export const creerEnv = (surcharges: Partial<Env> = {}): EnvFactice => {
  oublierJetonAds();
  return {
    OAUTH_KV: kvFactice(),
    ALLOWED_EMAIL: ADRESSE,
    GOOGLE_OAUTH_CLIENT_ID: 'client-google.apps.googleusercontent.com',
    GOOGLE_OAUTH_CLIENT_SECRET: 'secret-google',
    GOOGLE_ADS_REFRESH_TOKEN: 'refresh-ads',
    GOOGLE_ADS_CUSTOMER_ID: COMPTE,
    COOKIE_SIGNING_KEY: 'cle-de-signature-de-test',
    DB: new D1Test(),
    ADS_APERCU_KEY: 'cle-d-apercu-de-test',
    ADS_ECRITURES_MAX_JOUR: '30',
    ADS_BUDGET_MAX_JOUR: '10',
    ADS_BUDGET_MAX_TOTAL: '25',
    ADS_CPC_MAX: '2',
    ADS_CAMPAGNE_MODELE: '111',
    ...surcharges,
  } as EnvFactice;
};

const contexte = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext;

export const appeler = (env: Env, chemin: string, init: RequestInit = {}) =>
  worker.fetch(new Request(ORIGINE + chemin, init), env, contexte());

/** Les helpers de la bibliothèque, hors requête — comme le fera le script de repli. */
export const api = (env: Env) => getOAuthApi(OPTIONS, env);

export const VERIFICATEUR = 'verificateur-pkce-de-claude-assez-long-pour-la-rfc-7636';

/**
 * Un jeton d'accès délivré par la bibliothèque elle-même : client préenregistré,
 * grant complété, code échangé sur /token. Sans rejouer Google à chaque test.
 */
export const obtenirJetons = async (env: Env, email = ADRESSE, scopes: string[] = []) => {
  const client = await api(env).createClient({
    redirectUris: [CLAUDE], clientName: 'Claude (test)', tokenEndpointAuthMethod: 'none',
  });
  const { redirectTo } = await api(env).completeAuthorization({
    request: {
      responseType: 'code', clientId: client.clientId, redirectUri: CLAUDE, scope: [], state: 'etat',
      codeChallenge: await empreinte(VERIFICATEUR), codeChallengeMethod: 'S256', resource: RESSOURCE,
    },
    userId: email,
    metadata: {},
    scope: scopes,
    props: { email },
  });
  const reponse = await appeler(env, '/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code: new URL(redirectTo).searchParams.get('code')!,
      code_verifier: VERIFICATEUR, client_id: client.clientId, redirect_uri: CLAUDE,
    }).toString(),
  });
  const jetons = await reponse.json() as { access_token: string; refresh_token: string };
  return { ...jetons, clientId: client.clientId };
};

export const jetonValide = async (env: Env, email = ADRESSE, scopes: string[] = []) =>
  (await obtenirJetons(env, email, scopes)).access_token;

export type Appel = { url: string; methode: string; entetes: Record<string, string>; corps: string };

/**
 * Remplace `fetch` et consigne chaque appel sortant. `repondre` reçoit l'URL
 * et décide ; par défaut, le jeton Google Ads est délivré et le reste est vide.
 */
export const simulerFetch = (repondre: (appel: Appel) => Response | undefined = () => undefined) => {
  const appels: Appel[] = [];
  vi.stubGlobal('fetch', async (entree: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(entree instanceof Request ? entree.url : entree);
    const entetes: Record<string, string> = {};
    new Headers(init.headers).forEach((valeur, cle) => { entetes[cle] = valeur; });
    const appel: Appel = { url, methode: init.method ?? 'GET', entetes, corps: init.body ? String(init.body) : '' };
    appels.push(appel);

    const reponse = repondre(appel);
    if (reponse) return reponse;
    if (url === 'https://oauth2.googleapis.com/token') {
      return Response.json({ access_token: 'acces-ads', expires_in: 3599, token_type: 'Bearer' });
    }
    return Response.json({});
  });
  return appels;
};

/** Le corps JSON-RPC d'une requête moderne, avec les en-têtes qui doivent l'accompagner. */
export const requeteModerne = (jeton: string, methode: string, params: Record<string, unknown> = {}, id: number | string = 1) => ({
  method: 'POST',
  headers: {
    ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2026-07-28',
    'Mcp-Method': methode,
    ...(methode === 'tools/call' ? { 'Mcp-Name': String(params.name) } : {}),
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: methode,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'test', version: '0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  }),
});

/** Appelle un outil en moderne et rend le résultat JSON-RPC. `scopes` : ceux du jeton porteur. */
export const appelerOutil = async (env: Env, nom: string, args: Record<string, unknown> = {}, scopes: string[] = []) => {
  const jeton = await jetonValide(env, ADRESSE, scopes);
  const reponse = await appeler(env, '/mcp', requeteModerne(jeton, 'tools/call', { name: nom, arguments: args }));
  return { statut: reponse.status, corps: await reponse.json() as any };
};

export const texteDe = (corps: any): string => corps.result.content.map((c: { text: string }) => c.text).join('\n');
