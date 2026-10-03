/**
 * /authorize et /callback — la seule part de la couche A que
 * @cloudflare/workers-oauth-provider laisse à l'application : savoir qui est
 * l'utilisateur, et recueillir son accord. Le reste — métadonnées, clients CIMD,
 * codes, jetons, rotation, vérification du porteur — est la bibliothèque.
 *
 *   GET  /authorize   parseAuthRequest() → page de consentement (describeConsent)
 *   POST /authorize   → Google, `openid email` seulement
 *   GET  /callback    adresse certifiée → ALLOWED_EMAIL → completeAuthorization()
 *
 * AUCUNE ÉCRITURE KV AVANT L'IDENTIFICATION. La bibliothèque propose
 * beginConsent() et beginUpstream(), mais tous deux rangent la demande dans KV
 * dès le premier GET, quel que soit l'auteur de la requête : un robot qui
 * martèle /authorize remplirait la base et userait le quota d'écritures du plan
 * gratuit. La demande validée voyage donc dans un cookie signé, lié au
 * navigateur ; la première écriture est le grant de completeAuthorization(),
 * une fois l'adresse certifiée par Google et admise.
 *
 * Ne demande à Google que l'identité, pas l'accès Ads : les deux couches restent
 * séparées (cadrage §5), et la même connexion servira aux outils du corpus.
 */
import {
  AuthorizationError, CimdFetchError, authorizationErrorRedirect,
  type AuthRequest, type ConsentDescription,
} from '@cloudflare/workers-oauth-provider';
import { aleatoire, depuisBase64url, empreinte, signer, verifier } from './crypto';
import { SCOPE_CORPUS, SCOPE_ECRITURE, SCOPE_LECTURE } from './ecriture';
import { page, pageConsentement } from './pages';
import { Refus } from './refus';
import type { Env } from './env';

const GOOGLE_AUTORISATION = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_JETON = 'https://oauth2.googleapis.com/token';
const EMETTEURS_GOOGLE = ['https://accounts.google.com', 'accounts.google.com'];

const DUREE_CONNEXION = 10 * 60;

/**
 * `__Host-` : Secure, Path=/, aucun Domain — le navigateur refuse qu'un
 * sous-domaine le pose ou l'écrase. SameSite=Lax : il accompagne le retour de
 * Google (navigation de premier niveau), pas un POST venu d'un autre site.
 */
const COOKIE = '__Host-mcp-connexion';

/** La demande validée par la bibliothèque, le temps de l'aller-retour Google. */
type Connexion = {
  r: AuthRequest;
  v: string;  // vérificateur PKCE de NOTRE échange avec Google
  n: string;  // anti-rejeu du formulaire, et `state` côté Google
  e: number;  // expiration, ms
  s?: string[];  // les scopes choisis sur la page de consentement (V8)
};

/** Ce que le grant emporte, chiffré par la bibliothèque, et que /mcp reçoit en `ctx.props`. */
export type Props = { email: string };

/** Échoue fermée : sans ALLOWED_EMAIL, personne. */
export const adresseAutorisee = (env: Env, email: unknown): boolean =>
  typeof email === 'string' && Boolean(env.ALLOWED_EMAIL) &&
  email.trim().toLowerCase() === env.ALLOWED_EMAIL!.trim().toLowerCase();

const exiger = (valeur: string | undefined, nom: string): string => {
  if (!valeur) throw new Refus(`Serveur MCP mal configuré : secret ${nom} absent (voir workers/mcp/README.md).`, 503);
  return valeur;
};

const redirection = (vers: string, entetes: Record<string, string> = {}) =>
  new Response(null, { status: 302, headers: { Location: vers, 'Cache-Control': 'no-store', ...entetes } });

const cookie = (valeur: string, duree: number) =>
  `${COOKIE}=${valeur}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${duree}`;

const EFFACER = { 'Set-Cookie': cookie('', 0) };

const lireConnexion = async (requete: Request, env: Env): Promise<Connexion | null> => {
  for (const morceau of (requete.headers.get('Cookie') ?? '').split(';')) {
    const [cle, ...valeur] = morceau.trim().split('=');
    if (cle !== COOKIE) continue;
    const connexion = await verifier<Connexion>('connexion', valeur.join('='), exiger(env.COOKIE_SIGNING_KEY, 'COOKIE_SIGNING_KEY'));
    return connexion && connexion.e > Date.now() ? connexion : null;
  }
  return null;
};

/**
 * Les erreurs de la bibliothèque, selon sa règle : on ne renvoie vers le
 * client que si elle a validé son adresse de retour (`redirectTo`) ; sinon on
 * affiche, et on ne redirige nulle part.
 */
const repondreErreur = (erreur: unknown): Response => {
  if (erreur instanceof AuthorizationError && erreur.redirectTo) return redirection(erreur.redirectTo);
  if (erreur instanceof AuthorizationError) return page(400, 'Demande refusée', erreur.description);
  if (erreur instanceof CimdFetchError) {
    return page(400, 'Client non vérifiable',
      "Le document qui décrit ce client n'a pas pu être lu ou validé. Réessayez depuis Claude ; " +
      "si l'échec persiste, voir « Repli » dans workers/mcp/README.md.");
  }
  throw erreur;
};

/** GET /authorize — la bibliothèque valide, on affiche le consentement et on pose le cookie. */
const afficherConsentement = async (requete: Request, env: Env): Promise<Response> => {
  const secret = exiger(env.COOKIE_SIGNING_KEY, 'COOKIE_SIGNING_KEY');
  let demande: AuthRequest;
  let description: ConsentDescription;
  try {
    demande = await env.OAUTH_PROVIDER.parseAuthRequest(requete);
    description = await env.OAUTH_PROVIDER.describeConsent(demande);
  } catch (erreur) {
    return repondreErreur(erreur);
  }

  const connexion: Connexion = { r: demande, v: aleatoire(), n: aleatoire(16), e: Date.now() + DUREE_CONNEXION * 1000 };
  return pageConsentement({
    description,
    ecrireCoche: demande.scope.includes(SCOPE_ECRITURE),
    corpusCoche: demande.scope.includes(SCOPE_CORPUS),
    jeton: connexion.n,
    cookie: cookie(await signer('connexion', connexion, secret), DUREE_CONNEXION),
  });
};

/** POST /authorize — le bouton du consentement. Part chez Google. */
const partirVersGoogle = async (requete: Request, env: Env): Promise<Response> => {
  const formulaire = new URLSearchParams(await requete.text());
  const connexion = await lireConnexion(requete, env);
  if (!connexion || formulaire.get('n') !== connexion.n) {
    return page(400, 'Connexion expirée',
      'Cette page de consentement a expiré, ou a été ouverte dans un autre navigateur. Relancez la connexion depuis Claude.');
  }

  // V8 : l'écriture s'accorde ici, case cochée — jamais par effet de bord. Le
  // choix voyage dans le cookie, signé à nouveau, jusqu'au retour de Google.
  // Deux cases, deux scopes : écrire dans Google Ads n'emporte pas le corpus, ni l'inverse.
  const choisie: Connexion = {
    ...connexion,
    s: [
      SCOPE_LECTURE,
      ...(formulaire.get('ecrire') === '1' ? [SCOPE_ECRITURE] : []),
      ...(formulaire.get('corpus') === '1' ? [SCOPE_CORPUS] : []),
    ],
  };
  const secret = exiger(env.COOKIE_SIGNING_KEY, 'COOKIE_SIGNING_KEY');

  const google = new URL(GOOGLE_AUTORISATION);
  google.search = new URLSearchParams({
    client_id: exiger(env.GOOGLE_OAUTH_CLIENT_ID, 'GOOGLE_OAUTH_CLIENT_ID'),
    redirect_uri: `${new URL(requete.url).origin}/callback`,
    response_type: 'code',
    scope: 'openid email',
    state: connexion.n,
    code_challenge: await empreinte(connexion.v),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return redirection(google.toString(), {
    'Set-Cookie': cookie(await signer('connexion', choisie, secret), Math.max(1, Math.floor((choisie.e - Date.now()) / 1000))),
  });
};

type Revendications = { iss?: string; aud?: string; exp?: number; email?: string; email_verified?: boolean };

/**
 * L'adresse que Google certifie, ou `null` si elle n'est pas vérifiée.
 *
 * Le jeton d'identité arrive DIRECTEMENT de Google, sur TLS, en échange de
 * notre secret client : OpenID Connect Core §3.1.3.7 dispense alors de vérifier
 * sa signature. Ses revendications, elles, se vérifient toutes.
 */
const identifier = async (env: Env, code: string, verificateur: string, retour: string): Promise<string | null> => {
  const clientId = exiger(env.GOOGLE_OAUTH_CLIENT_ID, 'GOOGLE_OAUTH_CLIENT_ID');
  const reponse = await fetch(GOOGLE_JETON, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: exiger(env.GOOGLE_OAUTH_CLIENT_SECRET, 'GOOGLE_OAUTH_CLIENT_SECRET'),
      redirect_uri: retour,
      code_verifier: verificateur,
    }),
  });
  const corps = await reponse.json().catch(() => ({})) as { id_token?: string; error?: string };
  if (!reponse.ok || !corps.id_token) {
    throw new Refus(`Google a refusé l'échange du code${corps.error ? ` (${corps.error})` : ''}. Relancez la connexion depuis Claude.`);
  }

  let r: Revendications | null = null;
  try {
    r = JSON.parse(new TextDecoder().decode(depuisBase64url(corps.id_token.split('.')[1])));
  } catch { /* traité juste en dessous */ }
  if (!r || !EMETTEURS_GOOGLE.includes(r.iss ?? '') || r.aud !== clientId || !r.exp || r.exp * 1000 < Date.now()) {
    throw new Refus("Le jeton d'identité rendu par Google est invalide. Relancez la connexion depuis Claude.");
  }
  return r.email_verified === true && typeof r.email === 'string' ? r.email : null;
};

/** GET /callback — Google rend la main. Seule étape qui écrit dans KV, et seulement pour l'adresse admise. */
const retourGoogle = async (requete: Request, env: Env): Promise<Response> => {
  const url = new URL(requete.url);
  const q = url.searchParams;

  // Le cookie lie le retour au navigateur qui a vu le consentement : un lien
  // Google fabriqué ailleurs et envoyé à Florent n'aboutit pas ici.
  const connexion = await lireConnexion(requete, env);
  if (!connexion || q.get('state') !== connexion.n) {
    return page(400, 'Connexion expirée',
      'Ce retour de Google ne correspond à aucune connexion ouverte dans ce navigateur. Relancez la connexion depuis Claude.');
  }

  if (q.get('error')) {
    return redirection(authorizationErrorRedirect(connexion.r, 'access_denied', `Google : ${q.get('error')}`), EFFACER);
  }
  const codeGoogle = q.get('code');
  if (!codeGoogle) return redirection(authorizationErrorRedirect(connexion.r, 'invalid_request', 'Google n’a rendu aucun code.'), EFFACER);

  const email = await identifier(env, codeGoogle, connexion.v, `${url.origin}/callback`);
  if (!adresseAutorisee(env, email)) {
    return page(403, 'Adresse non autorisée',
      `${email ?? 'Cette identité Google'} n'est pas autorisée sur ce serveur. Aucun accès n'a été délivré.`, EFFACER);
  }

  try {
    const props: Props = { email: email!.toLowerCase() };
    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
      request: connexion.r,
      userId: props.email,
      metadata: {},
      scope: connexion.s ?? [SCOPE_LECTURE],
      props,
    });
    return redirection(redirectTo, EFFACER);
  } catch (erreur) {
    // Une demande reconstituée ne sert jamais à rediriger : on affiche.
    if (erreur instanceof AuthorizationError) return page(400, 'Demande refusée', erreur.description, EFFACER);
    return repondreErreur(erreur);
  }
};

/** Tout ce qui n'est ni /mcp ni un point d'entrée de la bibliothèque. */
export const gestionnaireParDefaut = {
  async fetch(requete: Request, env: Env): Promise<Response> {
    const url = new URL(requete.url);
    try {
      switch (url.pathname) {
        case '/authorize':
          if (requete.method === 'GET') return await afficherConsentement(requete, env);
          if (requete.method === 'POST') return await partirVersGoogle(requete, env);
          return new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });
        case '/callback':
          return requete.method === 'GET' ? await retourGoogle(requete, env) : new Response(null, { status: 405, headers: { Allow: 'GET' } });
        case '/':
          return new Response("Serveur MCP Luminose — Google Ads, lecture seule.\nPoint d'entrée : /mcp\n", {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        default:
          return Response.json({ error: 'Introuvable' }, { status: 404 });
      }
    } catch (erreur) {
      // Un secret absent, un échange refusé par Google : on le dit, sans le journaliser.
      if (erreur instanceof Refus) return page(erreur.status, 'Connexion impossible', erreur.message);
      console.error(`${requete.method} ${url.pathname} :`, erreur);
      return page(500, 'Erreur interne', 'La connexion a échoué côté serveur. Le détail est dans les journaux du Worker.');
    }
  },
};
