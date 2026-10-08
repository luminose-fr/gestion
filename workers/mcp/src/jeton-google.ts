/**
 * Le jeton d'accès Google, pour Google Ads (couche B) comme pour Tag Manager
 * (couche D, 08/10/2026). Chacune a son refresh token, son secret et ses
 * scopes ; le renouvellement, lui, est le même, et ne s'écrit qu'ici.
 *
 * Le jeton d'accès vit une heure ; on le garde dans l'isolat jusqu'à une
 * minute de son expiration. Indexé par le refresh token : un secret changé ne
 * sert jamais l'ancien jeton, et le jeton de l'une des couches ne sert jamais
 * l'autre — celui de Tag Manager n'a pas le scope `adwords`, et l'inverse.
 */
import { Refus } from './refus';
import type { Env } from './env';

const JETON_GOOGLE = 'https://oauth2.googleapis.com/token';

const caches = new Map<string, { acces: string; expire: number }>();

/** Pour les tests : chaque cas repart d'un isolat neuf. */
export const oublierJetonsGoogle = () => { caches.clear(); };

export const exigerSecret = (valeur: string | undefined, nom: string): string => {
  if (!valeur) {
    throw new Refus(
      `Secret ${nom} absent du Worker MCP. Posez-le depuis la VM : ` +
      `cd workers/mcp && npx wrangler secret put ${nom} (voir workers/mcp/README.md).`,
      503,
    );
  }
  return valeur;
};

/**
 * Un jeton d'accès pour `refresh`. `secret` et `script` ne servent qu'au
 * message : ce qu'il faut régénérer, et comment, quand Google refuse.
 */
export const jetonGoogle = async (env: Env, refresh: string, secret: string, script: string): Promise<string> => {
  const clientId = exigerSecret(env.GOOGLE_OAUTH_CLIENT_ID, 'GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = exigerSecret(env.GOOGLE_OAUTH_CLIENT_SECRET, 'GOOGLE_OAUTH_CLIENT_SECRET');

  const enCache = caches.get(refresh);
  if (enCache && enCache.expire > Date.now() + 60_000) return enCache.acces;

  const reponse = await fetch(JETON_GOOGLE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const corps = await reponse.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string };

  if (!reponse.ok || !corps.access_token) {
    if (corps.error === 'invalid_grant') {
      throw new Refus(
        'Google refuse le refresh token (invalid_grant) : il a été révoqué, ou le client OAuth a changé. ' +
        `Régénérez-le avec ${script}, puis wrangler secret put ${secret}.`,
        503,
      );
    }
    throw new Error(`Renouvellement du jeton Google (${secret}) : HTTP ${reponse.status}${corps.error ? ` (${corps.error})` : ''}`);
  }

  caches.set(refresh, { acces: corps.access_token, expire: Date.now() + (corps.expires_in ?? 3600) * 1000 });
  return corps.access_token;
};
