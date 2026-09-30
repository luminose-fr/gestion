/**
 * Un KV de comptoir, un Google de comptoir, et de quoi appeler le Worker.
 */
import { vi } from 'vitest';
import worker from '../src/index';
import { empreinte } from '../src/crypto';
import { oublierJetonAds } from '../src/google-ads';
import type { Env } from '../src/env';

export const ORIGINE = 'https://mcp.test';
export const COMPTE = '1234567890';
export const ADRESSE = 'florent@luminose.fr';

/** KV en mémoire, qui respecte `expirationTtl` : un code de 60 s meurt vraiment. */
export const kvFactice = () => {
  const entrees = new Map<string, { valeur: string; expire?: number }>();
  const kv = {
    entrees,
    async get(cle: string, type?: string) {
      const e = entrees.get(cle);
      if (!e || (e.expire !== undefined && e.expire <= Date.now())) return null;
      return type === 'json' ? JSON.parse(e.valeur) : e.valeur;
    },
    async put(cle: string, valeur: string, options?: { expirationTtl?: number }) {
      entrees.set(cle, { valeur, expire: options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined });
    },
    async delete(cle: string) {
      entrees.delete(cle);
    },
  };
  return kv as typeof kv & KVNamespace;
};

export const creerEnv = (surcharges: Partial<Env> = {}): Env & { OAUTH_KV: ReturnType<typeof kvFactice> } => {
  oublierJetonAds();
  return {
    OAUTH_KV: kvFactice(),
    ALLOWED_EMAIL: ADRESSE,
    GOOGLE_OAUTH_CLIENT_ID: 'client-google.apps.googleusercontent.com',
    GOOGLE_OAUTH_CLIENT_SECRET: 'secret-google',
    GOOGLE_ADS_REFRESH_TOKEN: 'refresh-ads',
    GOOGLE_ADS_CUSTOMER_ID: COMPTE,
    OAUTH_SIGNING_KEY: 'cle-de-signature-de-test',
    ...surcharges,
  } as Env & { OAUTH_KV: ReturnType<typeof kvFactice> };
};

export const appeler = (env: Env, chemin: string, init: RequestInit = {}) =>
  worker.fetch(new Request(ORIGINE + chemin, init), env);

/** Un jeton d'accès valide, posé directement dans KV — pour tester /mcp sans rejouer OAuth. */
export const jetonValide = async (env: Env, email = ADRESSE): Promise<string> => {
  const jeton = 'jeton-acces-de-test';
  await env.OAUTH_KV.put(`acces:${await empreinte(jeton)}`, JSON.stringify({
    c: 'client', email, res: `${ORIGINE}/mcp`, e: Date.now() + 3_600_000,
  }), { expirationTtl: 3600 });
  return jeton;
};

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
    Authorization: `Bearer ${jeton}`,
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

/** Appelle un outil en moderne et rend le résultat JSON-RPC. */
export const appelerOutil = async (env: Env, nom: string, args: Record<string, unknown> = {}) => {
  const jeton = await jetonValide(env);
  const reponse = await appeler(env, '/mcp', requeteModerne(jeton, 'tools/call', { name: nom, arguments: args }));
  return { statut: reponse.status, corps: await reponse.json() as any };
};

export const texteDe = (corps: any): string => corps.result.content.map((c: { text: string }) => c.text).join('\n');
