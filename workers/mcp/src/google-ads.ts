/**
 * Couche B — le Worker vers l'API Google Ads.
 *
 * LIRE : la liste des comptes accessibles et `googleAds:search`.
 * ÉCRIRE (cadrage du 01/10/2026) : `:mutate` sur une TABLE FERMÉE de services,
 * et pour chacun la seule forme d'opération permise (OPERATIONS_PERMISES). Pas
 * de mutate générique : ce que la table ne nomme pas ne part pas.
 *
 * Aucune URL de l'API ne se construit ailleurs que dans ce fichier, et
 * `appeler` refuse tout chemin absent de CHEMINS_PERMIS. C'est ce qui rend
 * vérifiable, et vérifié, que les verrous V1 et V5 tiennent quelle que soit
 * l'entrée : ni `remove`, ni passage à ENABLED, ni service hors de la table.
 *
 * PAS D'EN-TÊTE `developer-token`. Le jeton de développeur a été supprimé les
 * 9-10/09/2026 : les niveaux d'accès sont portés par le projet Google Cloud qui
 * émet les identifiants OAuth. Ignoré aujourd'hui, il sera refusé dans une
 * prochaine version majeure. Tout exemple qui l'envoie est antérieur.
 */
import { Refus } from './refus';
import type { Env } from './env';

/**
 * La dernière version stable au 30/09/2026 — v25, publiée le 22/07/2026,
 * vérifiée dans la documentation Google (sunset-dates, release-notes). Seul
 * endroit où elle s'écrit : monter de version, c'est changer cette ligne et
 * relire les notes de version pour les champs GAQL renommés.
 */
export const VERSION_API = 'v25';

const RACINE = `https://googleads.googleapis.com/${VERSION_API}`;
const JETON_GOOGLE = 'https://oauth2.googleapis.com/token';

/** Un identifiant de compte Google Ads : dix chiffres, sans tirets. */
const FORME_COMPTE = /^\d{10}$/;

/**
 * Les seules écritures possibles, service par service (verrous V1 et V5).
 *
 * - `campaignCriteria` : CRÉER un mot-clé NÉGATIF de campagne, et rien d'autre.
 *   Il naît actif — un négatif ne dépense rien, il exclut ; en pause, il
 *   n'exclurait rien (décision du 01/10/2026).
 * - les quatre autres : METTRE À JOUR le statut, vers PAUSED et vers rien
 *   d'autre. Aucune entité ne passe à ENABLED par ce serveur : l'activation —
 *   donc la dépense — reste dans l'interface Google Ads.
 *
 * Aucun `remove` nulle part : ce qu'on veut retirer, on le met en pause.
 */
export const OPERATIONS_PERMISES = {
  campaignCriteria: 'creer-negatif',
  campaigns: 'mettre-en-pause',
  adGroups: 'mettre-en-pause',
  adGroupAds: 'mettre-en-pause',
  adGroupCriteria: 'mettre-en-pause',
} as const;

export type ServiceEcriture = keyof typeof OPERATIONS_PERMISES;

const SERVICES_ECRITURE = Object.keys(OPERATIONS_PERMISES) as ServiceEcriture[];

const CHEMINS_PERMIS: RegExp[] = [
  /^\/customers:listAccessibleCustomers$/,
  /^\/customers\/\d{10}\/googleAds:search$/,
  new RegExp(`^/customers/\\d{10}/(${SERVICES_ECRITURE.join('|')}):mutate$`),
];

/** Une erreur renvoyée par l'API elle-même — à remonter au modèle telle quelle. */
export class ErreurAds extends Error {
  constructor(readonly statut: number, readonly brut: string) {
    super(decrireErreur(statut, brut));
    this.name = 'ErreurAds';
  }
}

/**
 * Le code d'erreur GAQL est ce qui permet au modèle de corriger sa requête
 * (`queryError.UNRECOGNIZED_FIELD` dit quoi changer ; « 400 » ne dit rien).
 * On le met en tête, et la réponse brute suit — tronquée, pas réécrite.
 */
const decrireErreur = (statut: number, brut: string): string => {
  const lignes: string[] = [];
  try {
    const erreur = JSON.parse(brut)?.error ?? {};
    lignes.push(`Erreur de l'API Google Ads — HTTP ${statut}${erreur.status ? ` ${erreur.status}` : ''}${erreur.message ? ` : ${erreur.message}` : ''}`);
    for (const detail of erreur.details ?? []) {
      for (const e of detail?.errors ?? []) {
        const code = Object.entries(e.errorCode ?? {}).map(([famille, valeur]) => `${famille}.${valeur}`).join(', ');
        lignes.push(`- ${code}${code && e.message ? ' — ' : ''}${e.message ?? ''}`);
      }
    }
  } catch {
    lignes.push(`Erreur de l'API Google Ads — HTTP ${statut}`);
  }
  lignes.push('', 'Réponse brute :', brut.slice(0, 4000));
  return lignes.join('\n');
};

export const normaliserCompte = (brut: string): string => brut.replace(/[\s-]/g, '');

export const estUnCompte = (id: string): boolean => FORME_COMPTE.test(id);

/**
 * Les comptes que `ads_requete` accepte d'interroger : celui de Luminose et,
 * s'il existe, le compte administrateur par lequel on y accède. Rien d'autre,
 * même si le compte Google de Florent en voit d'autres.
 */
export const comptesAutorises = (env: Env): string[] =>
  [env.GOOGLE_ADS_CUSTOMER_ID, env.GOOGLE_ADS_LOGIN_CUSTOMER_ID]
    .filter((id): id is string => Boolean(id))
    .map(normaliserCompte)
    .filter(estUnCompte);

/**
 * L'en-tête `login-customer-id` ne sert que si l'accès passe par un compte
 * administrateur. Pour le compte administrateur lui-même, ou sans MCC, on
 * l'omet — c'est ce que la documentation REST demande pour un accès direct.
 */
export const connexionPour = (env: Env, compte: string): string | undefined => {
  const administrateur = normaliserCompte(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '');
  return estUnCompte(administrateur) && administrateur !== compte ? administrateur : undefined;
};

// ── Jeton d'accès ────────────────────────────────────────────────────────

/**
 * Le jeton d'accès vit une heure ; on le garde dans l'isolat jusqu'à une
 * minute de son expiration. Indexé par le refresh token : un secret changé ne
 * sert jamais l'ancien jeton.
 */
let cache: { refresh: string; acces: string; expire: number } | null = null;

/** Pour les tests : chaque cas repart d'un isolat neuf. */
export const oublierJetonAds = () => { cache = null; };

const exiger = (valeur: string | undefined, nom: string): string => {
  if (!valeur) {
    throw new Refus(
      `Secret ${nom} absent du Worker MCP. Posez-le depuis la VM : ` +
      `cd workers/mcp && npx wrangler secret put ${nom} (voir workers/mcp/README.md).`,
      503,
    );
  }
  return valeur;
};

const jetonAcces = async (env: Env): Promise<string> => {
  const refresh = exiger(env.GOOGLE_ADS_REFRESH_TOKEN, 'GOOGLE_ADS_REFRESH_TOKEN');
  const clientId = exiger(env.GOOGLE_OAUTH_CLIENT_ID, 'GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = exiger(env.GOOGLE_OAUTH_CLIENT_SECRET, 'GOOGLE_OAUTH_CLIENT_SECRET');

  if (cache && cache.refresh === refresh && cache.expire > Date.now() + 60_000) return cache.acces;

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
        'Régénérez-le avec workers/mcp/scripts/jeton-google-ads.mjs, puis wrangler secret put GOOGLE_ADS_REFRESH_TOKEN.',
        503,
      );
    }
    throw new Error(`Renouvellement du jeton Google Ads : HTTP ${reponse.status}${corps.error ? ` (${corps.error})` : ''}`);
  }

  cache = { refresh, acces: corps.access_token, expire: Date.now() + (corps.expires_in ?? 3600) * 1000 };
  return cache.acces;
};

// ── Appels ───────────────────────────────────────────────────────────────

const appeler = async (
  env: Env,
  chemin: string,
  options: { corps?: unknown; connexion?: string } = {},
): Promise<unknown> => {
  // La garde ne dépend pas de l'appelant : même un chemin assemblé de travers
  // plus haut ne sort pas d'ici.
  if (!CHEMINS_PERMIS.some((permis) => permis.test(chemin))) {
    throw new Error(`Chemin refusé par la couche B : ${chemin}`);
  }
  const acces = await jetonAcces(env);
  const entetes: Record<string, string> = { Authorization: `Bearer ${acces}` };
  if (options.corps !== undefined) entetes['Content-Type'] = 'application/json';
  if (options.connexion) entetes['login-customer-id'] = options.connexion;

  const reponse = await fetch(RACINE + chemin, {
    method: options.corps === undefined ? 'GET' : 'POST',
    headers: entetes,
    body: options.corps === undefined ? undefined : JSON.stringify(options.corps),
  });
  const texte = await reponse.text();
  if (!reponse.ok) throw new ErreurAds(reponse.status, texte);
  return texte ? JSON.parse(texte) : {};
};

/** Les identifiants des comptes que le compte Google connecté voit directement. */
export const listerAccessibles = async (env: Env): Promise<string[]> => {
  const { resourceNames = [] } = await appeler(env, '/customers:listAccessibleCustomers') as { resourceNames?: string[] };
  return resourceNames.map((nom) => nom.replace(/^customers\//, '')).filter(estUnCompte);
};

export type ReponseRecherche = { results?: unknown[]; nextPageToken?: string };

/**
 * Une page de `googleAds:search`. Depuis la v17, la taille de page est fixée
 * par Google à 10 000 lignes : bien au-delà de ce que l'outil renvoie au
 * modèle, si bien qu'une seconde page ne serait jamais lue. On ne la demande
 * pas ; la troncature le dit.
 */
export const rechercher = async (
  env: Env,
  compte: string,
  requete: string,
  connexion?: string,
): Promise<ReponseRecherche> => {
  if (!estUnCompte(compte)) throw new Refus(`« ${compte} » n'est pas un identifiant de compte Google Ads (dix chiffres).`);
  return await appeler(env, `/customers/${compte}/googleAds:search`, { corps: { query: requete }, connexion }) as ReponseRecherche;
};

// ── Écriture ─────────────────────────────────────────────────────────────

export type Operation =
  | { create: Record<string, unknown> }
  | { update: Record<string, unknown>; updateMask: string };

const MOTS_CLES_CORRESPONDANCES = ['EXACT', 'PHRASE', 'BROAD'];

/**
 * La garde de la table : une opération qui n'a pas exactement la forme permise
 * pour son service ne part pas. Une violation ici n'est pas une erreur de
 * l'utilisateur — les outils ne construisent que des opérations conformes —
 * mais un défaut du code : on lève, et la trace part dans les journaux.
 */
export const verifierOperation = (service: ServiceEcriture, operation: Operation): void => {
  const cles = Object.keys(operation).sort().join(',');
  const refuser = (raison: string): never => {
    throw new Error(`Opération refusée par la table fermée (${service}) : ${raison}`);
  };

  switch (OPERATIONS_PERMISES[service]) {
    case 'creer-negatif': {
      if (cles !== 'create') refuser(`clés ${cles}`);
      const c = (operation as { create: Record<string, unknown> }).create;
      const keyword = c.keyword as { text?: unknown; matchType?: unknown } | undefined;
      if (Object.keys(c).sort().join(',') !== 'campaign,keyword,negative') refuser(`champs ${Object.keys(c).sort().join(',')}`);
      if (c.negative !== true) refuser('un critère de campagne ne peut être que négatif');
      if (typeof c.campaign !== 'string' || !/^customers\/\d{10}\/campaigns\/\d+$/.test(c.campaign)) refuser('campagne');
      if (!keyword || typeof keyword.text !== 'string' || !MOTS_CLES_CORRESPONDANCES.includes(String(keyword.matchType))) refuser('mot-clé');
      return;
    }
    case 'mettre-en-pause': {
      if (cles !== 'update,updateMask') refuser(`clés ${cles}`);
      const { update, updateMask } = operation as { update: Record<string, unknown>; updateMask: string };
      if (updateMask !== 'status') refuser(`updateMask ${updateMask}`);
      if (Object.keys(update).sort().join(',') !== 'resourceName,status') refuser(`champs ${Object.keys(update).sort().join(',')}`);
      if (update.status !== 'PAUSED') refuser(`statut ${String(update.status)}`);
      if (typeof update.resourceName !== 'string' || !new RegExp(`^customers/\\d{10}/${service}/\\d+(~\\d+)?$`).test(update.resourceName)) {
        refuser('resourceName');
      }
      return;
    }
  }
};

export type ReponseMutation = { results?: { resourceName?: string }[] };

/**
 * `:mutate` sur le compte donné. `validateOnly` : Google vérifie tout et
 * n'applique rien — c'est l'aperçu (V2). `partialFailure` à false : tout passe,
 * ou rien.
 */
export const muter = async (
  env: Env,
  compte: string,
  service: ServiceEcriture,
  operations: Operation[],
  validateOnly: boolean,
): Promise<ReponseMutation> => {
  if (!estUnCompte(compte)) throw new Refus(`« ${compte} » n'est pas un identifiant de compte Google Ads (dix chiffres).`);
  if (!(service in OPERATIONS_PERMISES)) throw new Error(`Service hors de la table fermée : ${service}`);
  if (operations.length === 0) throw new Error('Aucune opération à envoyer');
  for (const operation of operations) verifierOperation(service, operation);
  return await appeler(env, `/customers/${compte}/${service}:mutate`, {
    corps: { operations, validateOnly, partialFailure: false },
    connexion: connexionPour(env, compte),
  }) as ReponseMutation;
};
