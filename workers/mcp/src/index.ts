/**
 * Worker MCP — mcp.luminose.fr
 *
 *   /mcp                                     le serveur MCP (POST), derrière un jeton porteur
 *   /.well-known/oauth-protected-resource/…  RFC 9728    ┐
 *   /.well-known/oauth-authorization-server  RFC 8414    ├ @cloudflare/workers-oauth-provider
 *   /token                                   codes, jetons, rotation, révocation ┘
 *   /authorize  /callback                    identification et consentement (autorisation.ts)
 *
 * Couche A : Claude → ce Worker (OAuth, Google en amont, une adresse admise).
 * Couche B : ce Worker → Google Ads (refresh token en secret, lecture seule).
 * Indépendantes : aucune ne transporte les jetons de l'autre.
 *
 * CLIENTS : Client ID Metadata Documents seulement. Claude se présente par
 * l'URL de son document ; pas d'enregistrement dynamique (déprécié par MCP
 * 2026-07-28). Repli prévu si CIMD échoue avec claude.ai : un client
 * préenregistré (scripts/client-preenregistre.mjs), rien d'autre.
 */
import { OAuthError, OAuthProvider, type OAuthProviderOptions } from '@cloudflare/workers-oauth-provider';
import { adresseAutorisee, gestionnaireParDefaut, type Props } from './autorisation';
import { traiterMcp } from './mcp';
import type { Env } from './env';

/**
 * L'URL que Florent saisit dans Claude, au caractère près : Claude la compare
 * aux métadonnées, et la bibliothèque en fait l'audience de chaque jeton.
 */
export const RESSOURCE = 'https://mcp.luminose.fr/mcp';

const json = (statut: number, corps: unknown, entetes: Record<string, string> = {}) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json', ...entetes } });

/**
 * La spécification MCP exige de valider `Origin` sur le point d'entrée (contre
 * le rebinding DNS). Les appels de Claude partent de ses serveurs ou de Claude
 * Code, sans Origin ; un navigateur n'est attendu que depuis Claude lui-même
 * ou l'inspecteur MCP lancé en local.
 */
const origineAdmise = (origine: string | null): boolean => {
  if (origine === null || origine === new URL(RESSOURCE).origin || origine === 'https://claude.ai' || origine === 'https://claude.com') return true;
  try {
    const u = new URL(origine);
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
};

/** /mcp, une fois le jeton vérifié par la bibliothèque. */
const api = {
  async fetch(requete: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!origineAdmise(requete.headers.get('Origin'))) {
      return json(403, { jsonrpc: '2.0', error: { code: -32600, message: 'Origine refusée' } });
    }
    // L'adresse est revérifiée à chaque appel : retirer ALLOWED_EMAIL coupe les
    // jetons déjà délivrés, sans attendre leur expiration.
    const { email } = (ctx as ExecutionContext<Props>).props ?? {};
    if (!adresseAutorisee(env, email)) {
      return json(401, { error: 'invalid_token', error_description: 'Adresse retirée de la liste d’autorisation.' }, {
        // Même défi que celui de la bibliothèque : Claude y lit où se reconnecter.
        'WWW-Authenticate': `Bearer realm="OAuth", resource_metadata="${new URL(RESSOURCE).origin}/.well-known/oauth-protected-resource/mcp", error="invalid_token"`,
      });
    }
    // Ni flux GET ni session à fermer : chaque requête est un POST autonome.
    if (requete.method !== 'POST') return json(405, { error: 'Méthode non permise' }, { Allow: 'POST' });
    return traiterMcp(requete, env);
  },
};

export const OPTIONS: OAuthProviderOptions<Env> = {
  apiRoute: '/mcp',
  apiHandler: api,
  defaultHandler: gestionnaireParDefaut,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  resourceMetadata: { resource: RESSOURCE, resource_name: 'Luminose — Google Ads (lecture seule)' },
  // Exige aussi `global_fetch_strictly_public` dans wrangler.toml : sans le
  // drapeau, la bibliothèque n'annonce pas CIMD et Claude ne peut plus entrer.
  clientIdMetadataDocumentEnabled: true,
  // Glissant : chaque rafraîchissement repart pour trente jours.
  refreshTokenIdleTTL: 30 * 24 * 60 * 60,
  // Une adresse retirée de la liste ne rafraîchit plus : `invalid_grant`
  // révoque le grant, et Claude redemande une connexion — qui échouera.
  tokenExchangeCallback: ({ grantType, props, env }) => {
    if (grantType === 'refresh_token' && !adresseAutorisee(env, (props as Props | undefined)?.email)) {
      throw new OAuthError('invalid_grant', { description: 'Adresse retirée de la liste d’autorisation.' });
    }
  },
  // Un refus OAuth n'est pas une panne (CLAUDE.md) : on ne journalise que les
  // vraies pannes, et les échecs de document CIMD — c'est par eux qu'on saura
  // si claude.ai passe ou s'il faut le client préenregistré.
  onError: ({ status, code, internal }) => {
    if (status >= 500 || internal?.category === 'client-id-metadata-document') {
      console.warn(`OAuth ${status} ${code} :`, internal);
    }
  },
};

export default new OAuthProvider<Env>(OPTIONS);
