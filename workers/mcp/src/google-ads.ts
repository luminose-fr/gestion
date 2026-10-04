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
 * l'entrée : ni passage à ENABLED, ni service hors de la table, et pour tout
 * `remove`, une exclusion que le compte confirme (`verifierRetraits`).
 *
 * PAS D'EN-TÊTE `developer-token`. Le jeton de développeur a été supprimé les
 * 9-10/09/2026 : les niveaux d'accès sont portés par le projet Google Cloud qui
 * émet les identifiants OAuth. Ignoré aujourd'hui, il sera refusé dans une
 * prochaine version majeure. Tout exemple qui l'envoie est antérieur.
 */
import { Refus } from './refus';
import { MARQUE, examinerAnnonce, textesParDefaut, urlAdmise } from './regles';
import { analyser, longueur as longueurAffichee, texteParDefaut } from './insertion';
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
 * Les seules écritures possibles, service par service (verrous V1 et V5) — une
 * liste de FORMES, chacune vérifiée champ par champ par `verifierOperation`.
 *
 * Lot 1 (01/10/2026) :
 * - `creer-negatif` : un mot-clé NÉGATIF de campagne. Il naît actif — il
 *   exclut, il ne dépense pas (décision du 01/10/2026).
 * - `mettre-en-pause` : le statut vers PAUSED, et vers rien d'autre.
 * Lot 2 (02/10/2026) — créer, en pause et marqué « [Claude] » :
 * - `creer-campagne` : budget + campagne Search + ciblage recopié, en une
 *   requête atomique (`googleAds:mutate`), montants sous les plafonds.
 * - `creer-groupe`, `creer-annonce`, `creer-mot-cle` : PAUSED, marqués.
 * - `creer-libelle`, `lier-libelle` : le libellé « [Claude] » et rien d'autre.
 *
 * Listes de négatifs (03/10/2026) — exclure à plusieurs campagnes à la fois :
 * - `creer-liste` : une liste partagée NEGATIVE_KEYWORDS marquée « [Claude] »,
 *   avec ses premiers mots-clés, en une requête atomique (`googleAds:mutate`).
 * - `ajouter-a-liste`, `associer-liste` : une entrée, un lien liste–campagne.
 * - `retirer-negatif`, `retirer-de-liste`, `dissocier-liste` : les seuls
 *   `remove` de la table. Ils lèvent une EXCLUSION, et rien d'autre — ce que
 *   la forme d'un nom de ressource ne peut pas dire : `verifierRetraits` le
 *   demande au compte avant chaque envoi.
 *
 * Éléments d'annonce (04/10/2026) — liens annexes, accroches, extraits structurés :
 * - `creer-elements` : les éléments et leurs associations, en une requête
 *   atomique (`googleAds:mutate`) ; chaque association naît EN PAUSE.
 * - `associer-element` : un élément existant, à une campagne ou un groupe, en pause.
 * - `dissocier-element` : le lien seulement — l'élément reste dans le compte.
 *   Comme les retraits d'exclusion, `verifierRetraits` le confirme dans le compte.
 *
 * Aucun autre `remove`, aucun passage à ENABLED : l'activation — donc la
 * dépense — reste dans l'interface Google Ads.
 */
export const OPERATIONS_PERMISES = {
  campaignCriteria: ['creer-negatif', 'retirer-negatif'],
  campaigns: ['mettre-en-pause'],
  adGroups: ['mettre-en-pause', 'creer-groupe'],
  adGroupAds: ['mettre-en-pause', 'creer-annonce'],
  adGroupCriteria: ['mettre-en-pause', 'creer-mot-cle'],
  adGroupAdLabels: ['lier-libelle'],
  adGroupCriterionLabels: ['lier-libelle'],
  labels: ['creer-libelle'],
  sharedCriteria: ['ajouter-a-liste', 'retirer-de-liste'],
  campaignSharedSets: ['associer-liste', 'dissocier-liste'],
  campaignAssets: ['associer-element', 'dissocier-element'],
  adGroupAssets: ['associer-element', 'dissocier-element'],
  googleAds: ['creer-campagne', 'creer-liste', 'creer-elements'],
} as const;

/** Les éléments d'annonce que ce serveur crée et associe — le type d'élément est aussi le type de champ de l'association. */
export const TYPES_ELEMENTS = ['SITELINK', 'CALLOUT', 'STRUCTURED_SNIPPET'] as const;
export type TypeElement = (typeof TYPES_ELEMENTS)[number];

/**
 * Les limites de Google pour ces éléments, en caractères affichés (aide Google
 * Ads, relue le 04/10/2026) : lien annexe 25, ses deux descriptions 35 chacune
 * — les deux ou aucune ; accroche 25 ; extrait structuré, 3 à 10 valeurs de 25.
 */
export const LIMITES_ELEMENTS = { lien: 25, lienDescription: 35, accroche: 25, valeur: 25, valeursMin: 3, valeursMax: 10 } as const;

/**
 * Les en-têtes d'extrait structuré, en français : la liste fermée de Google
 * (« Structured Snippet Header Translations », relue le 04/10/2026). Un autre
 * en-tête serait refusé par Google ; il l'est ici d'abord, en clair.
 */
export const EN_TETES_EXTRAITS = [
  'Équipements', 'Marques', 'Cours', "Programmes d'études", 'Destinations', "Sélection d'hôtels", "Couverture d'assurance",
  'Modèles', 'Quartiers', 'Catalogue de services', 'Émissions', 'Styles', 'Types',
] as const;

/**
 * Les limites de Google pour les listes de mots-clés à exclure, relevées le
 * 03/10/2026 dans l'aide Google Ads (« About negative keyword lists »,
 * support.google.com/google-ads/answer/2453983) : 20 listes par compte, 5 000
 * mots-clés par liste. Google les dit susceptibles de changer. Les outils les
 * font respecter avant l'aperçu, pour le dire en clair ; Google les revérifie.
 */
export const LIMITES_LISTES = { parCompte: 20, entreesParListe: 5000 } as const;

export type ServiceEcriture = keyof typeof OPERATIONS_PERMISES;
type Forme = (typeof OPERATIONS_PERMISES)[ServiceEcriture][number];

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

/** Une règle de Google qu'un mot-clé enfreint, telle que l'API la décrit. */
export type Violation = {
  /** Rang de l'opération fautive dans la requête, quand Google le donne. */
  index: number | null;
  cle: { policyName: string; violatingText: string };
  regle: string;
  description: string;
  exemptable: boolean;
};

/**
 * Les violations de règlement d'une erreur de l'API (`policyViolationDetails`),
 * ou `null` si l'erreur contient AUTRE CHOSE — elle reste alors une erreur
 * ordinaire, à remonter telle quelle.
 */
export const violationsDeRegle = (e: ErreurAds): Violation[] | null => {
  try {
    const erreurs = (JSON.parse(e.brut)?.error?.details ?? []).flatMap((d: { errors?: unknown[] }) => d?.errors ?? []) as {
      details?: { policyViolationDetails?: { key?: { policyName?: string; violatingText?: string }; externalPolicyName?: string; externalPolicyDescription?: string; isExemptible?: boolean } };
      location?: { fieldPathElements?: { fieldName?: string; index?: number }[] };
    }[];
    if (erreurs.length === 0) return null;
    const violations: Violation[] = [];
    for (const err of erreurs) {
      const v = err.details?.policyViolationDetails;
      if (!v?.key?.policyName) return null;
      const chemin = err.location?.fieldPathElements?.[0];
      violations.push({
        index: chemin?.fieldName === 'operations' && Number.isInteger(chemin.index) ? chemin.index! : null,
        cle: { policyName: v.key.policyName, violatingText: v.key.violatingText ?? '' },
        regle: v.externalPolicyName ?? v.key.policyName,
        description: v.externalPolicyDescription ?? '',
        exemptable: v.isExemptible === true,
      });
    }
    return violations;
  } catch {
    return null;
  }
};

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

/** Une opération telle qu'elle part chez Google. Sa forme est vérifiée par la table, pas par le type. */
export type Operation = Record<string, unknown>;

const CORRESPONDANCES = ['EXACT', 'PHRASE', 'BROAD'];

/** Les plafonds d'argent (cadrage du 02/10/2026, R3), en micros. */
export type Limites = { budgetMaxJour: number; budgetMaxTotal: number; cpcMax: number };

const euros = (env: Env, nom: 'ADS_BUDGET_MAX_JOUR' | 'ADS_BUDGET_MAX_TOTAL' | 'ADS_CPC_MAX'): number => {
  const brut = env[nom];
  const valeur = Number(brut);
  // Échoue fermé, comme le plafond de volume : un plafond illisible n'est pas « pas de plafond ».
  if (!brut || !Number.isFinite(valeur) || valeur <= 0) {
    throw new Refus(`${nom} absent ou illisible dans wrangler.toml : la création est fermée.`, 503);
  }
  return Math.round(valeur * 1_000_000);
};

export const limitesArgent = (env: Env): Limites => ({
  budgetMaxJour: euros(env, 'ADS_BUDGET_MAX_JOUR'),
  budgetMaxTotal: euros(env, 'ADS_BUDGET_MAX_TOTAL'),
  cpcMax: euros(env, 'ADS_CPC_MAX'),
});

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const cles = (o: unknown) => (estObjet(o) ? Object.keys(o).sort().join(',') : typeof o);
const ressource = (type: string, temporaire = false) =>
  new RegExp(`^customers/\\d{10}/${type}/${temporaire ? '-\\d+' : '\\d+(~\\d+)?'}$`);
const marque = (nom: unknown) => typeof nom === 'string' && nom.startsWith(`${MARQUE} `);
const longueur = (t: unknown, max: number) => typeof t === 'string' && t.trim().length > 0 && [...t].length <= max;
/**
 * Un texte d'annonce : l'insertion de mot-clé bien formée, et la longueur
 * comptée comme Google la compte — sur le texte par défaut, pas sur la syntaxe.
 */
const affichable = (t: unknown, max: number) => {
  if (typeof t !== 'string' || !t.trim()) return false;
  const a = analyser(t);
  return a.erreurs.length === 0 && longueurAffichee(texteParDefaut(a)) <= max;
};
const motCle = (k: unknown) =>
  cles(k) === 'matchType,text' && typeof (k as Record<string, unknown>).text === 'string' &&
  CORRESPONDANCES.includes(String((k as Record<string, unknown>).matchType));

/** Un `remove`, et seulement sur un nom de ressource composé de ce type : `parent~critère`. */
const retrait = (type: string, op: Operation): string | null => {
  if (cles(op) !== 'remove') return `clés ${cles(op)}`;
  if (!new RegExp(`^customers/\\d{10}/${type}/\\d+~\\d+$`).test(String(op.remove))) return 'nom de ressource';
  return null;
};

/** Chaque forme rend `null` si l'opération lui est conforme, sinon la raison. */
const FORMES: Record<Exclude<Forme, 'creer-campagne' | 'creer-liste' | 'creer-elements'>, (service: ServiceEcriture, op: Operation) => string | null> = {
  'creer-negatif': (_service, op) => {
    if (cles(op) !== 'create') return `clés ${cles(op)}`;
    const c = op.create as Record<string, unknown>;
    if (cles(c) !== 'campaign,keyword,negative') return `champs ${cles(c)}`;
    if (c.negative !== true) return 'un critère de campagne ne peut être que négatif';
    if (!ressource('campaigns').test(String(c.campaign))) return 'campagne';
    if (!motCle(c.keyword)) return 'mot-clé';
    return null;
  },

  'retirer-negatif': (_service, op) => retrait('campaignCriteria', op),

  'ajouter-a-liste': (_service, op) => {
    if (cles(op) !== 'create') return `clés ${cles(op)}`;
    const c = op.create as Record<string, unknown>;
    if (cles(c) !== 'keyword,sharedSet') return `champs ${cles(c)}`;
    if (!ressource('sharedSets').test(String(c.sharedSet))) return 'liste';
    if (!motCle(c.keyword)) return 'mot-clé';
    return null;
  },

  'retirer-de-liste': (_service, op) => retrait('sharedCriteria', op),

  'associer-liste': (_service, op) => {
    if (cles(op) !== 'create') return `clés ${cles(op)}`;
    const c = op.create as Record<string, unknown>;
    if (cles(c) !== 'campaign,sharedSet') return `champs ${cles(c)}`;
    if (!ressource('campaigns').test(String(c.campaign))) return 'campagne';
    if (!ressource('sharedSets').test(String(c.sharedSet))) return 'liste';
    return null;
  },

  'dissocier-liste': (_service, op) => retrait('campaignSharedSets', op),

  'associer-element': (service, op) => {
    if (cles(op) !== 'create') return `clés ${cles(op)}`;
    const c = op.create as Record<string, unknown>;
    const [champ, type] = service === 'campaignAssets' ? ['campaign', 'campaigns'] : ['adGroup', 'adGroups'];
    if (cles(c) !== ['asset', champ, 'fieldType', 'status'].sort().join(',')) return `champs ${cles(c)}`;
    // Rien ne naît actif : l'association part en pause, Florent l'active.
    if (c.status !== 'PAUSED') return `statut ${String(c.status)}`;
    if (!(TYPES_ELEMENTS as readonly string[]).includes(String(c.fieldType))) return `type ${String(c.fieldType)}`;
    if (!ressource('assets').test(String(c.asset))) return 'élément';
    if (!ressource(type).test(String(c[champ]))) return champ;
    return null;
  },

  'dissocier-element': (service, op) => {
    if (cles(op) !== 'remove') return `clés ${cles(op)}`;
    if (!new RegExp(`^customers/\\d{10}/${service}/\\d+~\\d+~(${TYPES_ELEMENTS.join('|')})$`).test(String(op.remove))) return 'nom de ressource';
    return null;
  },

  'mettre-en-pause': (service, op) => {
    if (cles(op) !== 'update,updateMask') return `clés ${cles(op)}`;
    const u = op.update as Record<string, unknown>;
    if (op.updateMask !== 'status') return `updateMask ${String(op.updateMask)}`;
    if (cles(u) !== 'resourceName,status') return `champs ${cles(u)}`;
    if (u.status !== 'PAUSED') return `statut ${String(u.status)}`;
    if (!ressource(service).test(String(u.resourceName))) return 'resourceName';
    return null;
  },

  'creer-groupe': (_service, op) => {
    if (cles(op) !== 'create') return `clés ${cles(op)}`;
    const c = op.create as Record<string, unknown>;
    if (cles(c) !== 'campaign,name,status,type') return `champs ${cles(c)}`;
    if (c.status !== 'PAUSED') return `statut ${String(c.status)}`;
    if (c.type !== 'SEARCH_STANDARD') return `type ${String(c.type)}`;
    if (!marque(c.name)) return 'nom sans la marque [Claude]';
    if (!ressource('campaigns').test(String(c.campaign))) return 'campagne';
    return null;
  },

  'creer-annonce': (_service, op) => {
    if (cles(op) !== 'create') return `clés ${cles(op)}`;
    const c = op.create as Record<string, unknown>;
    if (cles(c) !== 'ad,adGroup,status') return `champs ${cles(c)}`;
    if (c.status !== 'PAUSED') return `statut ${String(c.status)}`;
    if (!ressource('adGroups').test(String(c.adGroup))) return 'groupe';
    const ad = c.ad as Record<string, unknown>;
    if (cles(ad) !== 'finalUrls,responsiveSearchAd') return `annonce ${cles(ad)}`;
    const urls = ad.finalUrls;
    if (!Array.isArray(urls) || urls.length !== 1 || !urls.every((u) => typeof u === 'string' && urlAdmise(u))) return 'URL finale hors de luminose.fr';
    const rsa = ad.responsiveSearchAd as Record<string, unknown>;
    if (!estObjet(rsa) || Object.keys(rsa).some((k) => !['headlines', 'descriptions', 'path1', 'path2'].includes(k))) return `RSA ${cles(rsa)}`;
    const textes = (liste: unknown, min: number, max: number, taille: number) =>
      Array.isArray(liste) && liste.length >= min && liste.length <= max &&
      liste.every((t) => cles(t) === 'text' && affichable((t as { text: unknown }).text, taille));
    if (!textes(rsa.headlines, 3, 15, 30)) return 'titres';
    if (!textes(rsa.descriptions, 2, 4, 90)) return 'descriptions';
    // Pas d'insertion de mot-clé dans un chemin d'affichage.
    for (const chemin of [rsa.path1, rsa.path2]) if (chemin !== undefined && (!longueur(chemin, 15) || /[{}]/.test(String(chemin)))) return 'chemin';
    if (rsa.path2 !== undefined && rsa.path1 === undefined) return 'chemin2 sans chemin1';
    // Le filtre lit ce qui s'affiche sans mot-clé ; les rendus par mot-clé, l'outil les a lus avec les mots-clés du groupe.
    const { refus } = examinerAnnonce(textesParDefaut({
      titres: (rsa.headlines as { text: string }[]).map((t) => t.text),
      descriptions: (rsa.descriptions as { text: string }[]).map((t) => t.text),
      chemins: [rsa.path1, rsa.path2].filter((x): x is string => typeof x === 'string'),
    }));
    if (refus.length > 0) return `texte refusé (V4) : ${refus.join(' ; ')}`;
    return null;
  },

  'creer-mot-cle': (_service, op) => {
    // Une exception de règlement se demande au niveau de l'opération : des clés
    // que Google a lui-même rendues (outils-creation.ts), jamais saisies.
    if (cles(op) !== 'create' && cles(op) !== 'create,exemptPolicyViolationKeys') return `clés ${cles(op)}`;
    if ('exemptPolicyViolationKeys' in op) {
      const exceptions = op.exemptPolicyViolationKeys;
      if (!Array.isArray(exceptions) || exceptions.length === 0 || exceptions.length > 10 ||
          !exceptions.every((x) => cles(x) === 'policyName,violatingText' &&
            typeof (x as Record<string, unknown>).policyName === 'string' && typeof (x as Record<string, unknown>).violatingText === 'string')) {
        return 'exceptions de règlement mal formées';
      }
    }
    const c = op.create as Record<string, unknown>;
    // Pas de champ `negative` : un négatif de groupe exclurait sans relecture — il n'est pas dans la table.
    if (cles(c) !== 'adGroup,keyword,status') return `champs ${cles(c)}`;
    if (c.status !== 'PAUSED') return `statut ${String(c.status)}`;
    if (!ressource('adGroups').test(String(c.adGroup))) return 'groupe';
    if (!motCle(c.keyword)) return 'mot-clé';
    return null;
  },

  'lier-libelle': (service, op) => {
    if (cles(op) !== 'create') return `clés ${cles(op)}`;
    const c = op.create as Record<string, unknown>;
    const [champ, type] = service === 'adGroupAdLabels' ? ['adGroupAd', 'adGroupAds'] : ['adGroupCriterion', 'adGroupCriteria'];
    if (cles(c) !== [champ, 'label'].sort().join(',')) return `champs ${cles(c)}`;
    if (!ressource(type).test(String(c[champ]))) return champ;
    if (!ressource('labels').test(String(c.label))) return 'libellé';
    return null;
  },

  'creer-libelle': (_service, op) => {
    if (cles(op) !== 'create') return `clés ${cles(op)}`;
    const c = op.create as Record<string, unknown>;
    if (cles(c) !== 'name' || c.name !== MARQUE) return 'seul le libellé [Claude] se crée';
    return null;
  },
};

/**
 * La garde de la table : une opération qui n'a exactement aucune des formes
 * permises pour son service ne part pas. Une violation ici n'est pas une erreur
 * de l'utilisateur — les outils ne construisent que des opérations conformes —
 * mais un défaut du code : on lève, et la trace part dans les journaux.
 */
export const verifierOperation = (service: ServiceEcriture, operation: Operation): void => {
  const raisons: string[] = [];
  for (const forme of OPERATIONS_PERMISES[service] as readonly Forme[]) {
    if (forme === 'creer-campagne' || forme === 'creer-liste' || forme === 'creer-elements') { raisons.push(`${forme} : passer par muter`); continue; }
    const raison = FORMES[forme](service, operation);
    if (raison === null) return;
    raisons.push(`${forme} : ${raison}`);
  }
  throw new Error(`Opération refusée par la table fermée (${service}) — ${raisons.join(' | ')}`);
};

const RESEAU_GOOGLE_SEUL = { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false };
const AUTOMATISMES_COUPES = 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION:OPTED_OUT,TEXT_ASSET_AUTOMATION:OPTED_OUT';

/**
 * La requête atomique qui crée une campagne Search (cadrage du 02/10/2026) :
 * un budget, une campagne, ses critères de ciblage — dans cet ordre, et rien
 * d'autre. Les plafonds d'argent sont revérifiés ici, indépendamment de l'outil.
 */
export const verifierCreationCampagne = (operations: Operation[], limites: Limites): void => {
  const refuser = (raison: string): never => {
    throw new Error(`Opération refusée par la table fermée (googleAds) — creer-campagne : ${raison}`);
  };
  const types = operations.map((o) => cles(o));
  if (types[0] !== 'campaignBudgetOperation' || types[1] !== 'campaignOperation' ||
      types.slice(2).some((t) => t !== 'campaignCriterionOperation')) {
    refuser(`suite d'opérations ${types.join(' → ')}`);
  }

  const budget = operations[0].campaignBudgetOperation as Record<string, unknown>;
  if (cles(budget) !== 'create') refuser('budget : seule la création');
  const b = budget.create as Record<string, unknown>;
  if (cles(b) !== 'amountMicros,deliveryMethod,explicitlyShared,name,resourceName') refuser(`budget : champs ${cles(b)}`);
  if (!ressource('campaignBudgets', true).test(String(b.resourceName))) refuser('budget : nom de ressource temporaire');
  if (!marque(b.name)) refuser('budget : nom sans la marque [Claude]');
  if (b.deliveryMethod !== 'STANDARD') refuser('budget : livraison');
  if (b.explicitlyShared !== false) refuser('budget partagé');
  const montant = Number(b.amountMicros);
  if (!Number.isInteger(montant) || montant <= 0 || montant > limites.budgetMaxJour) refuser(`budget ${String(b.amountMicros)} au-delà du plafond`);

  const campagne = operations[1].campaignOperation as Record<string, unknown>;
  if (cles(campagne) !== 'create') refuser('campagne : seule la création');
  const c = campagne.create as Record<string, unknown>;
  const communs = ['advertisingChannelType', 'assetAutomationSettings', 'campaignBudget', 'containsEuPoliticalAdvertising',
    'geoTargetTypeSetting', 'name', 'networkSettings', 'resourceName', 'status'];
  const clics = [...communs, 'targetSpend'].sort().join(',');
  const conversions = [...communs, 'aiMaxSetting', 'maximizeConversions'].sort().join(',');
  if (cles(c) !== clics && cles(c) !== conversions) refuser(`campagne : champs ${cles(c)}`);
  if (c.status !== 'PAUSED') refuser(`campagne : statut ${String(c.status)}`);
  if (c.advertisingChannelType !== 'SEARCH') refuser('campagne : Search seulement');
  if (!marque(c.name)) refuser('campagne : nom sans la marque [Claude]');
  if (!ressource('campaigns', true).test(String(c.resourceName))) refuser('campagne : nom de ressource temporaire');
  if (c.campaignBudget !== b.resourceName) refuser('campagne : budget');
  if (JSON.stringify(c.networkSettings) !== JSON.stringify(RESEAU_GOOGLE_SEUL)) refuser('campagne : réseau Google seul');
  if (c.containsEuPoliticalAdvertising !== 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING') refuser('campagne : déclaration UE');
  const geo = c.geoTargetTypeSetting;
  if (!estObjet(geo) || Object.keys(geo).some((k) => !['positiveGeoTargetType', 'negativeGeoTargetType'].includes(k))) refuser('campagne : type de ciblage géographique');
  const automatismes = Array.isArray(c.assetAutomationSettings)
    ? (c.assetAutomationSettings as Record<string, unknown>[]).map((a) => `${String(a.assetAutomationType)}:${String(a.assetAutomationStatus)}`).sort().join(',')
    : '';
  if (automatismes !== AUTOMATISMES_COUPES) refuser('campagne : personnalisation du texte et extension d’URL doivent être coupées');
  if ('targetSpend' in c) {
    const t = c.targetSpend as Record<string, unknown>;
    const cpc = Number(t?.cpcBidCeilingMicros);
    if (cles(t) !== 'cpcBidCeilingMicros' || !Number.isInteger(cpc) || cpc <= 0 || cpc > limites.cpcMax) refuser('campagne : CPC max absent ou au-delà du plafond');
  } else {
    if (cles(c.maximizeConversions) !== '') refuser('campagne : Maximiser les conversions, sans autre réglage');
    const ai = c.aiMaxSetting as Record<string, unknown>;
    if (cles(ai) !== 'enableAiMax' || typeof ai.enableAiMax !== 'boolean') refuser('campagne : réglage AI Max');
  }

  let langue = false;
  let zone = false;
  for (const o of operations.slice(2)) {
    const op = o.campaignCriterionOperation as Record<string, unknown>;
    if (cles(op) !== 'create') refuser('critère : seule la création');
    const k = op.create as Record<string, unknown>;
    if (k.campaign !== c.resourceName) refuser('critère : campagne');
    const genre = Object.keys(k).filter((x) => x !== 'campaign' && x !== 'negative');
    if (genre.length !== 1 || !['language', 'location', 'proximity'].includes(genre[0])) refuser(`critère : ${genre.join(',')}`);
    if ('negative' in k && typeof k.negative !== 'boolean') refuser('critère : negative');
    if (genre[0] === 'language') langue = true;
    if ((genre[0] === 'location' || genre[0] === 'proximity') && k.negative !== true) zone = true;
  }
  // Une campagne sans zone ou sans langue diffuserait partout : refusé, quoi qu'ait recopié l'outil.
  if (!langue || !zone) refuser('ciblage incomplet : une langue et une zone au moins');
};

/**
 * La requête atomique qui crée une liste de négatifs : la liste, puis ses
 * premiers mots-clés, liés par le nom temporaire de la liste. Rien d'autre —
 * pas de lien à une campagne : il passe par `associer-liste`, et son aperçu.
 */
export const verifierCreationListe = (operations: Operation[]): void => {
  const refuser = (raison: string): never => {
    throw new Error(`Opération refusée par la table fermée (googleAds) — creer-liste : ${raison}`);
  };
  const types = operations.map((o) => cles(o));
  if (types[0] !== 'sharedSetOperation' || types.slice(1).some((t) => t !== 'sharedCriterionOperation')) {
    refuser(`suite d'opérations ${types.join(' → ')}`);
  }
  const liste = operations[0].sharedSetOperation as Record<string, unknown>;
  if (cles(liste) !== 'create') refuser('liste : seule la création');
  const l = liste.create as Record<string, unknown>;
  if (cles(l) !== 'name,resourceName,type') refuser(`liste : champs ${cles(l)}`);
  if (l.type !== 'NEGATIVE_KEYWORDS') refuser(`liste : type ${String(l.type)}`);
  if (!marque(l.name)) refuser('liste : nom sans la marque [Claude]');
  if (!ressource('sharedSets', true).test(String(l.resourceName))) refuser('liste : nom de ressource temporaire');
  for (const o of operations.slice(1)) {
    const op = o.sharedCriterionOperation as Record<string, unknown>;
    if (cles(op) !== 'create') refuser('entrée : seule la création');
    const k = op.create as Record<string, unknown>;
    if (cles(k) !== 'keyword,sharedSet' || k.sharedSet !== l.resourceName || !motCle(k.keyword)) refuser('entrée');
  }
};

/**
 * Ce qu'un élément d'annonce peut porter — rend `null`, ou la raison. Les
 * limites de Google, l'en-tête de la liste fermée, l'URL sur luminose.fr (V6),
 * et le filtre déontologique des annonces (V4), revérifiés ici quel que soit
 * l'outil.
 */
export const refusElement = (element: Record<string, unknown>): string | null => {
  const texte = (t: unknown, max: number) => typeof t === 'string' && t.trim().length > 0 && [...t].length <= max && !/[{}]/.test(t);
  const corps = Object.fromEntries(Object.entries(element).filter(([k]) => k !== 'resourceName'));
  let textes: string[];
  if (cles(corps) === 'finalUrls,sitelinkAsset') {
    const l = corps.sitelinkAsset as Record<string, unknown>;
    if (!estObjet(l) || !['linkText', 'description1,description2,linkText'].includes(cles(l))) return 'lien annexe : champs (les deux descriptions, ou aucune)';
    if (!texte(l.linkText, LIMITES_ELEMENTS.lien)) return 'lien annexe : texte';
    if ('description1' in l && (!texte(l.description1, LIMITES_ELEMENTS.lienDescription) || !texte(l.description2, LIMITES_ELEMENTS.lienDescription))) return 'lien annexe : descriptions';
    const urls = corps.finalUrls;
    if (!Array.isArray(urls) || urls.length !== 1 || typeof urls[0] !== 'string' || !urlAdmise(urls[0])) return 'lien annexe : URL finale hors de luminose.fr';
    textes = [l.linkText, l.description1, l.description2].filter((x): x is string => typeof x === 'string');
  } else if (cles(corps) === 'calloutAsset') {
    const a = corps.calloutAsset as Record<string, unknown>;
    if (cles(a) !== 'calloutText' || !texte(a.calloutText, LIMITES_ELEMENTS.accroche)) return 'accroche';
    textes = [String(a.calloutText)];
  } else if (cles(corps) === 'structuredSnippetAsset') {
    const e = corps.structuredSnippetAsset as Record<string, unknown>;
    if (cles(e) !== 'header,values') return 'extrait : champs';
    if (!(EN_TETES_EXTRAITS as readonly string[]).includes(String(e.header))) return `extrait : en-tête ${String(e.header)} hors de la liste de Google`;
    const v = e.values;
    if (!Array.isArray(v) || v.length < LIMITES_ELEMENTS.valeursMin || v.length > LIMITES_ELEMENTS.valeursMax ||
        !v.every((x) => texte(x, LIMITES_ELEMENTS.valeur)) || new Set(v.map((x) => String(x).toLowerCase())).size !== v.length) return 'extrait : valeurs';
    textes = v as string[];
  } else {
    return `type d'élément ${cles(corps)}`;
  }
  const { refus } = examinerAnnonce(textes);
  return refus.length ? `texte refusé (V4) : ${refus.join(' ; ')}` : null;
};

/** Le type de champ qu'un élément occupe, d'après sa forme. */
const typeElement = (element: Record<string, unknown>): TypeElement | null =>
  'sitelinkAsset' in element ? 'SITELINK' : 'calloutAsset' in element ? 'CALLOUT' : 'structuredSnippetAsset' in element ? 'STRUCTURED_SNIPPET' : null;

/**
 * La requête atomique qui crée des éléments d'annonce : les éléments d'abord,
 * puis une association par élément, toutes vers la même cible, chacune EN PAUSE
 * et au type de champ de son élément. Rien d'autre.
 */
export const verifierCreationElements = (operations: Operation[]): void => {
  const refuser = (raison: string): never => {
    throw new Error(`Opération refusée par la table fermée (googleAds) — creer-elements : ${raison}`);
  };
  const types = operations.map((o) => cles(o));
  const n = types.filter((t) => t === 'assetOperation').length;
  const lien = types[n];
  if (n === 0 || operations.length !== 2 * n || types.slice(0, n).some((t) => t !== 'assetOperation') ||
      !['campaignAssetOperation', 'adGroupAssetOperation'].includes(lien) || types.slice(n).some((t) => t !== lien)) {
    refuser(`suite d'opérations ${types.join(' → ')}`);
  }
  const crees = new Map<string, TypeElement>();
  for (const o of operations.slice(0, n)) {
    const op = o.assetOperation as Record<string, unknown>;
    if (cles(op) !== 'create') refuser('élément : seule la création');
    const a = op.create as Record<string, unknown>;
    if (!ressource('assets', true).test(String(a.resourceName))) refuser('élément : nom de ressource temporaire');
    const raison = refusElement(a);
    if (raison) refuser(`élément : ${raison}`);
    crees.set(String(a.resourceName), typeElement(a)!);
  }
  const [champ, type] = lien === 'campaignAssetOperation' ? ['campaign', 'campaigns'] : ['adGroup', 'adGroups'];
  const cibles = new Set<string>();
  const lies = new Set<string>();
  for (const o of operations.slice(n)) {
    const op = o[lien] as Record<string, unknown>;
    if (cles(op) !== 'create') refuser('association : seule la création');
    const c = op.create as Record<string, unknown>;
    if (cles(c) !== ['asset', champ, 'fieldType', 'status'].sort().join(',')) refuser(`association : champs ${cles(c)}`);
    if (c.status !== 'PAUSED') refuser(`association : statut ${String(c.status)}`);
    if (!ressource(type).test(String(c[champ]))) refuser(`association : ${champ}`);
    if (crees.get(String(c.asset)) !== c.fieldType) refuser('association : élément ou type de champ');
    cibles.add(String(c[champ]));
    lies.add(String(c.asset));
  }
  if (cibles.size !== 1 || lies.size !== n) refuser('chaque élément créé, associé une fois, à une seule cible');
};

type LigneRetrait = {
  campaignCriterion?: { resourceName?: string; type?: string; negative?: boolean; status?: string };
  sharedCriterion?: { resourceName?: string; type?: string };
  campaignSharedSet?: { resourceName?: string; status?: string };
  sharedSet?: { type?: string };
  campaignAsset?: { resourceName?: string; fieldType?: string; status?: string };
  adGroupAsset?: { resourceName?: string; fieldType?: string; status?: string };
};

/**
 * Pour chaque service où la table permet un `remove` : comment demander au
 * compte ce que vise un nom de ressource, et si son retrait est permis — une
 * exclusion levée (un négatif de campagne, une entrée d'une liste de négatifs,
 * le lien d'une telle liste à une campagne), ou le lien d'un élément d'annonce
 * que ce serveur gère. Rien d'autre ne se retire.
 */
const RETRAITS: Partial<Record<ServiceEcriture, {
  /** Ce qu'un retrait permis lève, pour le dire quand il ne l'est pas. */
  quoi: string;
  requete: (noms: string) => string;
  lire: (l: LigneRetrait) => { nom?: string; vivant: boolean; exclusion: boolean };
}>> = {
  campaignCriteria: {
    quoi: 'une exclusion',
    requete: (noms) => 'SELECT campaign_criterion.resource_name, campaign_criterion.type, campaign_criterion.negative, campaign_criterion.status ' +
      `FROM campaign_criterion WHERE campaign_criterion.resource_name IN (${noms})`,
    lire: ({ campaignCriterion: c }) => ({
      nom: c?.resourceName, vivant: c?.status !== 'REMOVED', exclusion: c?.type === 'KEYWORD' && c?.negative === true,
    }),
  },
  sharedCriteria: {
    quoi: 'une exclusion',
    requete: (noms) => `SELECT shared_criterion.resource_name, shared_criterion.type, shared_set.type FROM shared_criterion WHERE shared_criterion.resource_name IN (${noms})`,
    lire: ({ sharedCriterion: c, sharedSet: l }) => ({
      nom: c?.resourceName, vivant: true, exclusion: c?.type === 'KEYWORD' && l?.type === 'NEGATIVE_KEYWORDS',
    }),
  },
  campaignSharedSets: {
    quoi: 'une exclusion',
    requete: (noms) => 'SELECT campaign_shared_set.resource_name, campaign_shared_set.status, shared_set.type ' +
      `FROM campaign_shared_set WHERE campaign_shared_set.resource_name IN (${noms})`,
    lire: ({ campaignSharedSet: c, sharedSet: l }) => ({
      nom: c?.resourceName, vivant: c?.status !== 'REMOVED', exclusion: l?.type === 'NEGATIVE_KEYWORDS',
    }),
  },
  campaignAssets: {
    quoi: "le lien d'un élément d'annonce",
    requete: (noms) => `SELECT campaign_asset.resource_name, campaign_asset.field_type, campaign_asset.status FROM campaign_asset WHERE campaign_asset.resource_name IN (${noms})`,
    lire: ({ campaignAsset: c }) => ({
      nom: c?.resourceName, vivant: c?.status !== 'REMOVED', exclusion: (TYPES_ELEMENTS as readonly string[]).includes(String(c?.fieldType)),
    }),
  },
  adGroupAssets: {
    quoi: "le lien d'un élément d'annonce",
    requete: (noms) => `SELECT ad_group_asset.resource_name, ad_group_asset.field_type, ad_group_asset.status FROM ad_group_asset WHERE ad_group_asset.resource_name IN (${noms})`,
    lire: ({ adGroupAsset: c }) => ({
      nom: c?.resourceName, vivant: c?.status !== 'REMOVED', exclusion: (TYPES_ELEMENTS as readonly string[]).includes(String(c?.fieldType)),
    }),
  },
};

/**
 * Un `remove` ne part que si le COMPTE confirme qu'il lève une exclusion — ou le
 * lien d'un élément d'annonce, jamais l'élément. La
 * forme d'un nom de ressource ne le dit pas : `campaignCriteria/111~5` peut
 * être un négatif comme la zone de la campagne, dont le retrait la ferait
 * diffuser partout. Une lecture par appel, quel que soit le nombre de retraits.
 *
 * Une cible qui n'est pas une exclusion est un défaut du code — les outils ne
 * retirent que ce qu'ils ont eux-mêmes lu comme tel : on lève. Une cible
 * disparue est un état du compte : un refus.
 */
const verifierRetraits = async (env: Env, compte: string, service: ServiceEcriture, operations: Operation[]): Promise<void> => {
  const noms = operations.filter((o) => 'remove' in o).map((o) => String(o.remove));
  if (noms.length === 0) return;
  const regle = RETRAITS[service];
  if (!regle) throw new Error(`Retrait refusé par la table fermée (${service}) : aucun retrait n'y est permis`);
  // Les noms ont la forme vérifiée par la table — chiffres et tilde : rien ne sort des guillemets.
  const { results = [] } = await rechercher(env, compte, regle.requete(noms.map((n) => `'${n}'`).join(', ')), connexionPour(env, compte));
  const lus = new Map((results as LigneRetrait[]).map((l) => regle.lire(l)).filter((l) => l.nom).map((l) => [l.nom!, l]));
  for (const nom of noms) {
    const l = lus.get(nom);
    if (!l || !l.vivant) throw new Refus(`${nom} n'existe plus dans le compte : rien n'est parti. Refaites un aperçu.`);
    if (!l.exclusion) throw new Error(`Retrait refusé par la table fermée (${service}) : ${nom} n'est pas ${regle.quoi}`);
  }
};

export type ReponseMutation = {
  results?: { resourceName?: string }[];
  mutateOperationResponses?: Record<string, { resourceName?: string }>[];
};

/** Les noms de ressource rendus, quel que soit le point d'entrée. */
export const ressourcesRendues = (r: ReponseMutation): string[] => [
  ...(r.results ?? []).map((x) => x.resourceName),
  ...(r.mutateOperationResponses ?? []).map((x) => Object.values(x)[0]?.resourceName),
].filter((x): x is string => Boolean(x));

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

  if (service === 'googleAds') {
    const premiere = cles(operations[0]);
    if (premiere === 'sharedSetOperation') verifierCreationListe(operations);
    else if (premiere === 'assetOperation') verifierCreationElements(operations);
    else verifierCreationCampagne(operations, limitesArgent(env));
  } else {
    for (const operation of operations) verifierOperation(service, operation);
    await verifierRetraits(env, compte, service, operations);
  }
  const champ = service === 'googleAds' ? 'mutateOperations' : 'operations';
  return await appeler(env, `/customers/${compte}/${service}:mutate`, {
    corps: { [champ]: operations, validateOnly, partialFailure: false },
    connexion: connexionPour(env, compte),
  }) as ReponseMutation;
};
