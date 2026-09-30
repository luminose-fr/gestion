/**
 * Worker MCP — mcp.luminose.fr
 *
 *   /mcp                                  le serveur MCP (POST), derrière un jeton porteur
 *   /.well-known/oauth-protected-resource où Claude apprend à qui demander ce jeton (RFC 9728)
 *   /.well-known/oauth-authorization-server  les points d'entrée OAuth (RFC 8414)
 *   /register  /authorize  /callback  /token  la couche A (oauth.ts)
 *
 * Couche A : Claude → ce Worker (OAuth, Google en amont, une adresse admise).
 * Couche B : ce Worker → Google Ads (refresh token en secret, lecture seule).
 * Indépendantes : aucune ne transporte les jetons de l'autre.
 */
import { traiterMcp } from './mcp';
import {
  afficherConsentement, authentifier, delivrerJetons, enregistrer, metadonneesRessource, metadonneesServeur,
  partirVersGoogle, retourGoogle,
} from './oauth';
import { page } from './pages';
import { Refus } from './refus';
import type { Env } from './env';

/**
 * CORS ouvert sur les points d'entrée que l'inspecteur MCP appelle depuis un
 * navigateur. Sans risque : aucun ne lit de cookie, tous exigent un jeton ou
 * n'en délivrent qu'en échange d'un code et de son vérificateur PKCE.
 */
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version, Mcp-Method, Mcp-Name',
  'Access-Control-Expose-Headers': 'WWW-Authenticate',
  'Access-Control-Max-Age': '86400',
};
const AVEC_CORS = new Set(['/mcp', '/register', '/token']);

/** Les pages qu'un humain voit : leurs refus s'affichent en HTML, pas en JSON. */
const PAGES = new Set(['/authorize', '/callback']);

const json = (statut: number, corps: unknown, entetes: Record<string, string> = {}) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json', ...entetes } });

const nonPermis = (permises: string[]) =>
  json(405, { error: 'Méthode non permise' }, { Allow: permises.join(', ') });

/**
 * La spécification MCP exige de valider `Origin` sur le point d'entrée (contre
 * le rebinding DNS). Les appels de Claude partent de ses serveurs ou de Claude
 * Code, sans Origin ; un navigateur n'est attendu que depuis Claude lui-même
 * ou l'inspecteur MCP lancé en local.
 */
const origineAdmise = (origine: string | null, soi: string): boolean => {
  if (origine === null || origine === soi || origine === 'https://claude.ai' || origine === 'https://claude.com') return true;
  try {
    const u = new URL(origine);
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
};

const router = async (requete: Request, env: Env, url: URL): Promise<Response> => {
  const methode = requete.method;

  switch (url.pathname) {
    case '/.well-known/oauth-protected-resource':
    case '/.well-known/oauth-protected-resource/mcp':
      return methode === 'GET' ? json(200, metadonneesRessource(url.origin)) : nonPermis(['GET']);

    case '/.well-known/oauth-authorization-server':
      return methode === 'GET' ? json(200, metadonneesServeur(url.origin)) : nonPermis(['GET']);

    case '/register':
      return methode === 'POST' ? enregistrer(requete, env) : nonPermis(['POST']);

    case '/authorize':
      if (methode === 'GET') return afficherConsentement(requete, env);
      if (methode === 'POST') return partirVersGoogle(requete, env);
      return nonPermis(['GET', 'POST']);

    case '/callback':
      return methode === 'GET' ? retourGoogle(requete, env) : nonPermis(['GET']);

    case '/token':
      return methode === 'POST' ? delivrerJetons(requete, env) : nonPermis(['POST']);

    case '/mcp': {
      if (!origineAdmise(requete.headers.get('Origin'), url.origin)) {
        return json(403, { jsonrpc: '2.0', error: { code: -32600, message: 'Origine refusée' } });
      }
      // Ni flux GET ni session à fermer : chaque requête est un POST autonome.
      if (methode !== 'POST') return nonPermis(['POST']);
      const identite = await authentifier(requete, env);
      if (identite instanceof Response) return identite;
      return traiterMcp(requete, env);
    }

    case '/':
      return new Response("Serveur MCP Luminose — Google Ads, lecture seule.\nPoint d'entrée : /mcp\n", {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });

    default:
      return json(404, { error: 'Introuvable' });
  }
};

export default {
  async fetch(requete: Request, env: Env): Promise<Response> {
    const url = new URL(requete.url);
    const cors = AVEC_CORS.has(url.pathname) || url.pathname.startsWith('/.well-known/');
    if (requete.method === 'OPTIONS' && cors) return new Response(null, { status: 204, headers: CORS });

    let reponse: Response;
    try {
      reponse = await router(requete, env, url);
    } catch (e) {
      if (e instanceof Refus) {
        // Un secret absent, un échange refusé par Google : on le dit, sans le journaliser.
        reponse = PAGES.has(url.pathname)
          ? page(e.status, 'Connexion impossible', e.message)
          : json(e.status, { error: 'server_error', error_description: e.message });
      } else {
        console.error(`${requete.method} ${url.pathname} :`, e);
        reponse = json(500, { error: 'Erreur interne' });
      }
    }

    if (!cors) return reponse;
    const avecCors = new Response(reponse.body, reponse);
    for (const [cle, valeur] of Object.entries(CORS)) avecCors.headers.set(cle, valeur);
    return avecCors;
  },
} satisfies ExportedHandler<Env>;
