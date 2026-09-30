/**
 * Couche A — Claude vers ce serveur : un serveur d'autorisation OAuth 2.1
 * minimal, avec Google comme fournisseur d'identité en amont.
 *
 *   Claude ─ /register ─ /authorize ─▶ Google ─▶ /callback ─ /token ─▶ /mcp
 *
 * Ne demande à Google que `openid email` : l'identité, pas l'accès Ads. Les
 * deux couches restent séparées — le jour où les outils du corpus arriveront
 * derrière la même connexion, lire une fiche ne demandera pas d'ouvrir Google
 * Ads (cadrage, §5).
 *
 * LE CONTRÔLE est `ALLOWED_EMAIL` : une adresse, comparée à celle que Google
 * certifie. L'écran de consentement « Interne » ne laisse passer que le domaine
 * luminose.fr ; c'est un second rideau, pas le contrôle testé.
 *
 * AUCUNE ÉCRITURE AVANT L'IDENTIFICATION. L'enregistrement de client est sans
 * état (identifiant signé), la connexion en cours vit dans un cookie signé.
 * KV ne reçoit rien tant que Google n'a pas certifié l'adresse autorisée — un
 * robot qui martèle /register ou /authorize ne peut ni remplir la base ni
 * épuiser le quota d'écritures du plan gratuit.
 *
 * Pourquoi pas `workers-oauth-provider`, que le cadrage proposait : voir
 * workers/mcp/README.md, « Écarts avec le cadrage ».
 */
import { z } from 'zod';
import { aleatoire, depuisBase64url, empreinte, signer, verifier } from './crypto';
import { page, pageConsentement } from './pages';
import { Refus } from './refus';
import type { Env } from './env';

const GOOGLE_AUTORISATION = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_JETON = 'https://oauth2.googleapis.com/token';
const EMETTEURS_GOOGLE = ['https://accounts.google.com', 'accounts.google.com'];

const DUREE_ACCES = 60 * 60;
/** Glissant : chaque rafraîchissement repart pour trente jours. */
const DUREE_RAFRAICHISSEMENT = 30 * 24 * 60 * 60;
/** Soixante secondes est le plancher d'expiration de KV. */
const DUREE_CODE = 60;
const DUREE_CONNEXION = 10 * 60;
const COOKIE = 'mcp_connexion';

/**
 * La seule URL de retour des applications Claude hébergées — web, desktop,
 * mobile, Cowork (documentation des connecteurs, 30/09/2026). Claude Code, lui,
 * revient sur une boucle locale dont le port change à chaque session.
 */
const RETOURS_HEBERGES = ['https://claude.ai/api/mcp/auth_callback'];

// ── Types rangés ─────────────────────────────────────────────────────────

/**
 * Un client enregistré — tout entier dans son identifiant signé. `j` est un
 * aléa : sans lui, deux inscriptions identiques dans la même seconde
 * recevraient le même identifiant, et le code de l'une servirait à l'autre.
 */
type Client = { r: string[]; n?: string; i: number; j: string };

/** Une connexion en cours, dans le cookie signé, le temps de l'aller-retour Google. */
type Connexion = {
  c: string;            // client_id
  r: string;            // redirect_uri
  s: string | null;     // state du client, rendu tel quel
  d: string;            // défi PKCE du client
  res: string | null;   // resource (RFC 8707)
  v: string;            // vérificateur PKCE de NOTRE échange avec Google
  n: string;            // jeton anti-rejeu, aussi `state` côté Google
  e: number;            // expiration, ms
};

/** Ce que KV garde d'un code, d'un jeton d'accès ou de rafraîchissement. */
type Octroi = { c: string; email: string; res: string | null; e: number; r?: string; d?: string };

// ── Réponses ─────────────────────────────────────────────────────────────

const json = (statut: number, corps: unknown, entetes: Record<string, string> = {}) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json', ...entetes } });

const erreurOAuth = (statut: number, code: string, description: string) =>
  json(statut, { error: code, error_description: description }, { 'Cache-Control': 'no-store' });

const redirection = (vers: string, params: Record<string, string | null | undefined>, entetes: Record<string, string> = {}) => {
  const url = new URL(vers);
  for (const [cle, valeur] of Object.entries(params)) if (valeur != null) url.searchParams.set(cle, valeur);
  return new Response(null, { status: 302, headers: { Location: url.toString(), 'Cache-Control': 'no-store', ...entetes } });
};

// ── Configuration ────────────────────────────────────────────────────────

const exiger = (valeur: string | undefined, nom: string): string => {
  if (!valeur) {
    throw new Refus(`Serveur MCP mal configuré : secret ${nom} absent (voir workers/mcp/README.md).`, 503);
  }
  return valeur;
};

const cleSignature = (env: Env) => exiger(env.OAUTH_SIGNING_KEY, 'OAUTH_SIGNING_KEY');

/** Échoue fermée : sans ALLOWED_EMAIL, personne. */
export const adresseAutorisee = (env: Env, email: unknown): boolean =>
  typeof email === 'string' && Boolean(env.ALLOWED_EMAIL) &&
  email.trim().toLowerCase() === env.ALLOWED_EMAIL!.trim().toLowerCase();

// ── Métadonnées ──────────────────────────────────────────────────────────

/**
 * L'identifiant de la ressource est l'URL que Florent saisit dans Claude, au
 * caractère près : Claude compare les deux et refuse sinon.
 */
export const ressource = (origine: string) => `${origine}/mcp`;
export const adresseMetadonnees = (origine: string) => `${origine}/.well-known/oauth-protected-resource/mcp`;

/** RFC 9728. */
export const metadonneesRessource = (origine: string) => ({
  resource: ressource(origine),
  authorization_servers: [origine],
  bearer_methods_supported: ['header'],
  resource_name: 'Luminose — Google Ads (lecture seule)',
});

/**
 * RFC 8414. `none` seul : Claude s'enregistre en client public, et PKCE tient
 * lieu de secret. Pas de `client_id_metadata_document_supported` : Claude
 * retombe alors sur l'enregistrement dynamique, qui suffit ici.
 */
export const metadonneesServeur = (origine: string) => ({
  issuer: origine,
  authorization_endpoint: `${origine}/authorize`,
  token_endpoint: `${origine}/token`,
  registration_endpoint: `${origine}/register`,
  response_types_supported: ['code'],
  response_modes_supported: ['query'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  token_endpoint_auth_methods_supported: ['none'],
  code_challenge_methods_supported: ['S256'],
  authorization_response_iss_parameter_supported: true,
});

// ── Adresses de retour ───────────────────────────────────────────────────

const estBoucleLocale = (u: URL) =>
  u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);

/**
 * Une liste fermée plutôt qu'« toute URL https » : c'est ce qui empêche un
 * client enregistré par un tiers de recevoir un code à sa propre adresse.
 */
export const retourAdmis = (uri: string): boolean => {
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (u.hash || u.username || u.password) return false;
  return RETOURS_HEBERGES.includes(uri) || estBoucleLocale(u);
};

/** Sur une boucle locale le port change à chaque session (RFC 8252 §7.3) : on l'ignore, et rien d'autre. */
const memeRetour = (inscrit: string, demande: string): boolean => {
  if (inscrit === demande) return true;
  try {
    const a = new URL(inscrit);
    const b = new URL(demande);
    return estBoucleLocale(a) && estBoucleLocale(b) &&
      a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search;
  } catch {
    return false;
  }
};

/** RFC 8707 : un jeton pour ce serveur et aucun autre. Absent, on l'accepte — les clients anciens ne l'envoient pas. */
const ressourceValide = (valeur: string | null, origine: string): boolean => {
  if (valeur === null) return true;
  try {
    const u = new URL(valeur);
    const cible = u.origin + u.pathname.replace(/\/$/, '');
    return !u.hash && (cible === origine || cible === ressource(origine));
  } catch {
    return false;
  }
};

// ── Enregistrement dynamique (RFC 7591) ──────────────────────────────────

const schemaInscription = z.looseObject({
  redirect_uris: z.array(z.string()).min(1).max(10),
  client_name: z.string().max(200).optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
});

const lireClient = async (clientId: string | null, env: Env): Promise<Client | null> =>
  clientId ? verifier<Client>('client', clientId, cleSignature(env)) : null;

export const enregistrer = async (requete: Request, env: Env): Promise<Response> => {
  const secret = cleSignature(env);
  const analyse = schemaInscription.safeParse(await requete.json().catch(() => null));
  if (!analyse.success) return erreurOAuth(400, 'invalid_client_metadata', z.prettifyError(analyse.error));

  const { redirect_uris, client_name, grant_types, response_types } = analyse.data;
  const refusees = redirect_uris.filter((uri) => !retourAdmis(uri));
  if (refusees.length > 0) {
    return erreurOAuth(400, 'invalid_redirect_uri',
      `Adresse(s) de retour non admise(s) : ${refusees.join(', ')}. Ce serveur n'accepte que ` +
      `${RETOURS_HEBERGES.join(', ')} et les boucles locales (http://localhost, http://127.0.0.1).`);
  }
  if (grant_types?.some((g) => g !== 'authorization_code' && g !== 'refresh_token')) {
    return erreurOAuth(400, 'invalid_client_metadata', 'grant_types : seuls authorization_code et refresh_token sont pris en charge.');
  }
  if (response_types?.some((r) => r !== 'code')) {
    return erreurOAuth(400, 'invalid_client_metadata', 'response_types : seul code est pris en charge.');
  }

  const emis = Math.floor(Date.now() / 1000);
  const client: Client = { r: redirect_uris, i: emis, j: aleatoire(9), ...(client_name ? { n: client_name } : {}) };
  return json(201, {
    client_id: await signer('client', client, secret),
    client_id_issued_at: emis,
    redirect_uris,
    ...(client_name ? { client_name } : {}),
    // Quoi qu'ait demandé le client : la RFC permet au serveur de substituer
    // ses valeurs, à condition de les renvoyer.
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  }, { 'Cache-Control': 'no-store' });
};

// ── Autorisation ─────────────────────────────────────────────────────────

const lireCookie = (requete: Request, nom: string): string | null => {
  for (const morceau of (requete.headers.get('Cookie') ?? '').split(';')) {
    const [cle, ...valeur] = morceau.trim().split('=');
    if (cle === nom) return valeur.join('=');
  }
  return null;
};

/**
 * SameSite=Lax : le cookie accompagne le retour de Google (navigation de
 * premier niveau) mais pas un POST venu d'un autre site. `Secure` sauf en
 * développement, où le serveur tourne en http sur localhost.
 */
const cookie = (url: URL, valeur: string, duree: number) =>
  `${COOKIE}=${valeur}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${duree}${url.protocol === 'https:' ? '; Secure' : ''}`;

const lireConnexion = async (requete: Request, env: Env): Promise<Connexion | null> => {
  const valeur = lireCookie(requete, COOKIE);
  if (!valeur) return null;
  const connexion = await verifier<Connexion>('connexion', valeur, cleSignature(env));
  return connexion && connexion.e > Date.now() ? connexion : null;
};

/** GET /authorize — vérifie la demande, pose le cookie, affiche le consentement. */
export const afficherConsentement = async (requete: Request, env: Env): Promise<Response> => {
  const secret = cleSignature(env);
  const url = new URL(requete.url);
  const q = url.searchParams;

  // Tant que le client et son adresse de retour ne sont pas établis, on ne
  // redirige nulle part : ce serait une redirection ouverte.
  const clientId = q.get('client_id');
  const client = await lireClient(clientId, env);
  if (!clientId || !client) {
    return page(400, 'Client inconnu',
      "L'identifiant de client présenté n'a pas été émis par ce serveur. Retirez puis rajoutez le connecteur dans Claude.");
  }
  const retour = q.get('redirect_uri') ?? (client.r.length === 1 ? client.r[0] : null);
  if (!retour || !client.r.some((inscrit) => memeRetour(inscrit, retour))) {
    return page(400, 'Adresse de retour refusée', "L'adresse de retour demandée n'a pas été déclarée par ce client.");
  }

  const echec = (code: string, description: string) =>
    redirection(retour, { error: code, error_description: description, state: q.get('state'), iss: url.origin });

  if (q.get('response_type') !== 'code') return echec('unsupported_response_type', 'Seul response_type=code est pris en charge.');
  const defi = q.get('code_challenge');
  if (!defi || q.get('code_challenge_method') !== 'S256') {
    return echec('invalid_request', 'PKCE obligatoire : code_challenge avec code_challenge_method=S256.');
  }
  if (!ressourceValide(q.get('resource'), url.origin)) {
    return echec('invalid_target', `Ce serveur ne délivre de jetons que pour ${ressource(url.origin)}.`);
  }

  const connexion: Connexion = {
    c: clientId,
    r: retour,
    s: q.get('state'),
    d: defi,
    res: q.get('resource'),
    v: aleatoire(),
    n: aleatoire(16),
    e: Date.now() + DUREE_CONNEXION * 1000,
  };
  const hote = new URL(retour);
  return pageConsentement({
    client: client.n,
    hoteRetour: hote.host,
    boucleLocale: estBoucleLocale(hote),
    jeton: connexion.n,
    cookie: cookie(url, await signer('connexion', connexion, secret), DUREE_CONNEXION),
  });
};

/** POST /authorize — le bouton du consentement. Part chez Google. */
export const partirVersGoogle = async (requete: Request, env: Env): Promise<Response> => {
  const url = new URL(requete.url);
  const formulaire = new URLSearchParams(await requete.text());
  const connexion = await lireConnexion(requete, env);
  if (!connexion || formulaire.get('n') !== connexion.n) {
    return page(400, 'Connexion expirée', 'Cette page de consentement a expiré, ou a été ouverte dans un autre navigateur. Relancez la connexion depuis Claude.');
  }

  return redirection(GOOGLE_AUTORISATION, {
    client_id: exiger(env.GOOGLE_OAUTH_CLIENT_ID, 'GOOGLE_OAUTH_CLIENT_ID'),
    redirect_uri: `${url.origin}/callback`,
    response_type: 'code',
    scope: 'openid email',
    state: connexion.n,
    code_challenge: await empreinte(connexion.v),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
};

type Revendications = { iss?: string; aud?: string; exp?: number; email?: string; email_verified?: boolean };

const decoderCharge = (jwt: string): Revendications | null => {
  try {
    return JSON.parse(new TextDecoder().decode(depuisBase64url(jwt.split('.')[1])));
  } catch {
    return null;
  }
};

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

  const r = decoderCharge(corps.id_token);
  if (!r || !EMETTEURS_GOOGLE.includes(r.iss ?? '') || r.aud !== clientId || !r.exp || r.exp * 1000 < Date.now()) {
    throw new Refus("Le jeton d'identité rendu par Google est invalide. Relancez la connexion depuis Claude.");
  }
  return r.email_verified === true && typeof r.email === 'string' ? r.email : null;
};

/** GET /callback — Google rend la main. Seule étape qui écrit dans KV, et seulement pour l'adresse autorisée. */
export const retourGoogle = async (requete: Request, env: Env): Promise<Response> => {
  const url = new URL(requete.url);
  const q = url.searchParams;
  const effacer = { 'Set-Cookie': cookie(url, '', 0) };

  // Le cookie lie le retour au navigateur qui a vu le consentement : un lien
  // Google fabriqué ailleurs et envoyé à Florent n'aboutit pas ici.
  const connexion = await lireConnexion(requete, env);
  if (!connexion || q.get('state') !== connexion.n) {
    return page(400, 'Connexion expirée',
      'Ce retour de Google ne correspond à aucune connexion ouverte dans ce navigateur. Relancez la connexion depuis Claude.');
  }

  const vers = (params: Record<string, string>) =>
    redirection(connexion.r, { ...params, state: connexion.s, iss: url.origin }, effacer);

  if (q.get('error')) return vers({ error: 'access_denied', error_description: `Google : ${q.get('error')}` });
  const codeGoogle = q.get('code');
  if (!codeGoogle) return vers({ error: 'invalid_request', error_description: 'Google n’a rendu aucun code.' });

  const email = await identifier(env, codeGoogle, connexion.v, `${url.origin}/callback`);
  if (!adresseAutorisee(env, email)) {
    return page(403, 'Adresse non autorisée',
      `${email ?? 'Cette identité Google'} n'est pas autorisée sur ce serveur. Aucun jeton n'a été délivré.`, effacer);
  }

  const code = aleatoire();
  const octroi: Octroi = { c: connexion.c, email: email!, res: connexion.res, r: connexion.r, d: connexion.d, e: Date.now() + DUREE_CODE * 1000 };
  await env.OAUTH_KV.put(`code:${await empreinte(code)}`, JSON.stringify(octroi), { expirationTtl: DUREE_CODE });
  return vers({ code });
};

// ── Jetons ───────────────────────────────────────────────────────────────

const emettre = async (env: Env, clientId: string, email: string, res: string | null): Promise<Response> => {
  const acces = aleatoire();
  const rafraichissement = aleatoire();
  const maintenant = Date.now();
  const cleAcces = `acces:${await empreinte(acces)}`;
  const cleRafraichissement = `rafraichissement:${await empreinte(rafraichissement)}`;

  await Promise.all([
    env.OAUTH_KV.put(cleAcces, JSON.stringify({ c: clientId, email, res, e: maintenant + DUREE_ACCES * 1000 } satisfies Octroi),
      { expirationTtl: DUREE_ACCES }),
    env.OAUTH_KV.put(cleRafraichissement, JSON.stringify({ c: clientId, email, res, e: maintenant + DUREE_RAFRAICHISSEMENT * 1000 } satisfies Octroi),
      { expirationTtl: DUREE_RAFRAICHISSEMENT }),
  ]);

  return json(200, {
    access_token: acces,
    token_type: 'Bearer',
    expires_in: DUREE_ACCES,
    refresh_token: rafraichissement,
  }, { 'Cache-Control': 'no-store', Pragma: 'no-cache' });
};

/** Un client public peut aussi s'annoncer en Basic, sans secret. */
const clientDeBasic = (requete: Request): string | null => {
  const basic = /^Basic\s+(\S+)$/i.exec(requete.headers.get('Authorization') ?? '')?.[1];
  if (!basic) return null;
  try {
    return decodeURIComponent(atob(basic).split(':')[0]);
  } catch {
    return null;
  }
};

/**
 * POST /token. Toute erreur sur un code ou un jeton de rafraîchissement est
 * `invalid_grant` : c'est le code que Claude reconnaît pour redemander une
 * connexion, plutôt que de réessayer en boucle.
 */
export const delivrerJetons = async (requete: Request, env: Env): Promise<Response> => {
  const url = new URL(requete.url);
  const f = new URLSearchParams(await requete.text());
  const clientId = f.get('client_id') ?? clientDeBasic(requete);
  if (!clientId || !(await lireClient(clientId, env))) return erreurOAuth(401, 'invalid_client', 'Client inconnu de ce serveur.');
  if (!ressourceValide(f.get('resource'), url.origin)) {
    return erreurOAuth(400, 'invalid_target', `Ce serveur ne délivre de jetons que pour ${ressource(url.origin)}.`);
  }

  switch (f.get('grant_type')) {
    case 'authorization_code': {
      const code = f.get('code');
      const verificateur = f.get('code_verifier');
      if (!code || !verificateur) return erreurOAuth(400, 'invalid_request', 'code et code_verifier sont obligatoires.');

      const cle = `code:${await empreinte(code)}`;
      const octroi = await env.OAUTH_KV.get<Octroi>(cle, 'json');
      // Usage unique : effacé dès sa lecture, avant toute vérification — un
      // code présenté deux fois ne sert jamais la seconde.
      if (octroi) await env.OAUTH_KV.delete(cle);
      if (!octroi || octroi.e < Date.now() || octroi.c !== clientId) {
        return erreurOAuth(400, 'invalid_grant', 'Code inconnu, expiré ou déjà utilisé.');
      }
      const retour = f.get('redirect_uri');
      if (retour !== null && retour !== octroi.r) return erreurOAuth(400, 'invalid_grant', 'redirect_uri différente de celle de la demande.');
      if (await empreinte(verificateur) !== octroi.d) return erreurOAuth(400, 'invalid_grant', 'code_verifier ne correspond pas au défi PKCE.');
      if (!adresseAutorisee(env, octroi.email)) return erreurOAuth(400, 'invalid_grant', 'Adresse non autorisée.');
      return emettre(env, clientId, octroi.email, octroi.res);
    }

    case 'refresh_token': {
      const jeton = f.get('refresh_token');
      if (!jeton) return erreurOAuth(400, 'invalid_request', 'refresh_token est obligatoire.');
      const cle = `rafraichissement:${await empreinte(jeton)}`;
      const octroi = await env.OAUTH_KV.get<Octroi>(cle, 'json');
      if (!octroi || octroi.e < Date.now() || octroi.c !== clientId) {
        return erreurOAuth(400, 'invalid_grant', 'Jeton de rafraîchissement inconnu, expiré ou déjà utilisé.');
      }
      // Rotation (OAuth 2.1, clients publics) : l'ancien meurt dans la
      // réponse qui livre le nouveau.
      await env.OAUTH_KV.delete(cle);
      if (!adresseAutorisee(env, octroi.email)) return erreurOAuth(400, 'invalid_grant', 'Adresse non autorisée.');
      return emettre(env, clientId, octroi.email, octroi.res);
    }

    default:
      return erreurOAuth(400, 'unsupported_grant_type', 'Seuls authorization_code et refresh_token sont pris en charge.');
  }
};

// ── Ressource protégée ───────────────────────────────────────────────────

/**
 * L'adresse du porteur, ou la réponse 401 à renvoyer telle quelle. Le 401 est
 * ce qui déclenche la connexion côté Claude, et `resource_metadata` ce qui lui
 * dit où la faire. L'adresse est revérifiée à chaque appel : retirer
 * ALLOWED_EMAIL coupe les jetons déjà délivrés, sans attendre leur expiration.
 */
export const authentifier = async (requete: Request, env: Env): Promise<string | Response> => {
  const origine = new URL(requete.url).origin;
  const defi = (erreur?: string) => json(401,
    { error: erreur ?? 'unauthorized', error_description: erreur ? 'Jeton invalide ou expiré.' : 'Jeton porteur requis.' },
    { 'WWW-Authenticate': `Bearer resource_metadata="${adresseMetadonnees(origine)}"${erreur ? `, error="${erreur}"` : ''}` });

  const jeton = /^Bearer\s+(\S+)$/i.exec(requete.headers.get('Authorization') ?? '')?.[1];
  if (!jeton) return defi();
  const octroi = await env.OAUTH_KV.get<Octroi>(`acces:${await empreinte(jeton)}`, 'json');
  if (!octroi || octroi.e < Date.now() || !adresseAutorisee(env, octroi.email)) return defi('invalid_token');
  return octroi.email;
};
