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
import { aujourdhui, dateValide, equivalentQuotidien } from './dates';
import { exigerSecret, jetonGoogle, oublierJetonsGoogle } from './jeton-google';
import type { Env } from './env';

/**
 * La dernière version stable au 30/09/2026 — v25, publiée le 22/07/2026,
 * vérifiée dans la documentation Google (sunset-dates, release-notes). Seul
 * endroit où elle s'écrit : monter de version, c'est changer cette ligne et
 * relire les notes de version pour les champs GAQL renommés.
 */
export const VERSION_API = 'v25';

const RACINE = `https://googleads.googleapis.com/${VERSION_API}`;

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
 * Éléments d'annonce (04/10/2026, 06/10/2026) — liens annexes, info-bulles,
 * extraits structurés, prix :
 * - `creer-elements` : les éléments et leurs associations, en une requête
 *   atomique (`googleAds:mutate`).
 * - `associer-element` : un élément existant, à une campagne ou un groupe.
 * - `dissocier-element` : le lien seulement — l'élément reste dans le compte.
 *   Comme les retraits d'exclusion, `verifierRetraits` le confirme dans le compte.
 * Une association naît EN PAUSE ; ACTIVE seulement quand sa campagne est en
 * pause — la pause de la campagne suffit alors comme barrière. Ce n'est pas la
 * forme d'une opération qui le dit : `verifierActivations` le demande au compte
 * avant chaque envoi.
 *
 * Demand Gen (07/10/2026), en pause et marqué comme le Search :
 * - `creer-campagne-dg` : budget TOTAL, campagne et objectif de conversion, en
 *   une requête atomique (`googleAds:mutate`).
 * - `creer-groupe-dg` : le groupe, ses canaux, ses lieux et sa langue — ceux
 *   d'un préréglage, jamais d'autres — en une requête atomique.
 * - `creer-annonce-dg` : une annonce multi-élément, « Luminose » pour nom
 *   d'entreprise, automatismes coupés.
 *
 * Aucun autre `remove`, aucun autre passage à ENABLED : l'activation — donc la
 * dépense — reste dans l'interface Google Ads.
 */
export const OPERATIONS_PERMISES = {
  campaignCriteria: ['creer-negatif', 'retirer-negatif'],
  campaigns: ['mettre-en-pause'],
  adGroups: ['mettre-en-pause', 'creer-groupe'],
  adGroupAds: ['mettre-en-pause', 'creer-annonce', 'creer-annonce-dg'],
  adGroupCriteria: ['mettre-en-pause', 'creer-mot-cle'],
  adGroupAdLabels: ['lier-libelle'],
  adGroupCriterionLabels: ['lier-libelle'],
  labels: ['creer-libelle'],
  sharedCriteria: ['ajouter-a-liste', 'retirer-de-liste'],
  campaignSharedSets: ['associer-liste', 'dissocier-liste'],
  campaignAssets: ['associer-element', 'dissocier-element'],
  adGroupAssets: ['associer-element', 'dissocier-element'],
  googleAds: ['creer-campagne', 'creer-liste', 'creer-elements', 'creer-campagne-dg', 'creer-groupe-dg'],
} as const;

/** Les éléments d'annonce que ce serveur crée et associe — le type d'élément est aussi le type de champ de l'association. */
export const TYPES_ELEMENTS = ['SITELINK', 'CALLOUT', 'STRUCTURED_SNIPPET', 'PRICE'] as const;
export type TypeElement = (typeof TYPES_ELEMENTS)[number];

/**
 * Le statut d'une association à sa naissance (décision du 06/10/2026) : EN
 * PAUSE quand sa campagne est active ; ACTIVE quand sa campagne est en pause —
 * la pause de la campagne suffit alors comme barrière.
 */
const STATUTS_NAISSANCE: readonly string[] = ['PAUSED', 'ENABLED'];

/**
 * Les limites de Google pour ces éléments, en caractères affichés (aide Google
 * Ads, relue le 04/10/2026) : lien annexe 25, ses deux descriptions 35 chacune
 * — les deux ou aucune ; info-bulle 25 ; extrait structuré, 3 à 10 valeurs de
 * 25 ; prix, 3 à 8 lignes, titre et description de 25 chacun.
 */
export const LIMITES_ELEMENTS = {
  lien: 25, lienDescription: 35, infoBulle: 25, valeur: 25, valeursMin: 3, valeursMax: 10,
  prixLignesMin: 3, prixLignesMax: 8, prixTitre: 25, prixDescription: 25,
} as const;

/**
 * Les éléments de prix (PriceAsset) : leur type, leur qualificatif, l'unité
 * d'une ligne — les valeurs de l'API, que l'aperçu dit en français. Le
 * prix est en euros, la langue le français.
 */
export const TYPES_PRIX = {
  SERVICES: 'services', SERVICE_CATEGORIES: 'catégories de services', SERVICE_TIERS: 'niveaux de service',
  BRANDS: 'marques', EVENTS: 'événements', LOCATIONS: 'lieux', NEIGHBORHOODS: 'quartiers',
  PRODUCT_CATEGORIES: 'catégories de produits', PRODUCT_TIERS: 'niveaux de produits',
} as const;
export const QUALIFICATIFS_PRIX = { FROM: 'à partir de', UP_TO: "jusqu'à", AVERAGE: 'en moyenne' } as const;
export const UNITES_PRIX = { PER_HOUR: 'par heure', PER_DAY: 'par jour', PER_WEEK: 'par semaine', PER_MONTH: 'par mois', PER_YEAR: 'par an', PER_NIGHT: 'par nuit' } as const;

/**
 * Les en-têtes d'extrait structuré, en français : la liste fermée de Google
 * (« Structured Snippet Header Translations », relue le 04/10/2026). Un autre
 * en-tête serait refusé par Google ; il l'est ici d'abord, en clair.
 *
 * « Services » s'y ajoute : absent de la page, mais Google l'a accepté — deux
 * extraits du compte le portent (310681056350, 321446714719, relevés le
 * 04/10/2026), et Florent l'emploie.
 */
export const EN_TETES_EXTRAITS = [
  'Équipements', 'Marques', 'Cours', "Programmes d'études", 'Destinations', "Sélection d'hôtels", "Couverture d'assurance",
  'Modèles', 'Quartiers', 'Catalogue de services', 'Services', 'Émissions', 'Styles', 'Types',
] as const;

/**
 * Les limites de Google pour les listes de mots-clés à exclure, relevées le
 * 03/10/2026 dans l'aide Google Ads (« About negative keyword lists »,
 * support.google.com/google-ads/answer/2453983) : 20 listes par compte, 5 000
 * mots-clés par liste. Google les dit susceptibles de changer. Les outils les
 * font respecter avant l'aperçu, pour le dire en clair ; Google les revérifie.
 */
export const LIMITES_LISTES = { parCompte: 20, entreesParListe: 5000 } as const;

// ── Demand Gen (cadrage du 07/10/2026) — les constantes, à un seul endroit ─

/**
 * DG6 — ce que Google génère pour Demand Gen se coupe À L'ANNONCE, jamais à
 * la campagne : le premier envoi à blanc (07/10/2026) a refusé le champ
 * `asset_automation_settings` d'une campagne Demand Gen tout entier
 * (OPERATION_NOT_PERMITTED_FOR_CONTEXT, sur le champ et non sur un type). Les
 * trois types que la référence rattache à l'annonce multi-élément, tous coupés.
 */
export const AUTOMATISMES_DG_ANNONCE = [
  'GENERATE_DESIGN_VERSIONS_FOR_IMAGES', 'GENERATE_VIDEOS_FROM_OTHER_ASSETS', 'GENERATE_ANIMATED_IMAGES_FROM_OTHER_ASSETS',
] as const;

/** DG5 — les canaux, posés par le serveur : YouTube, Discover, Gmail ; ni Display ni Maps. */
export const CANAUX_DG = {
  youtubeInFeed: true, youtubeInStream: true, youtubeShorts: true, discover: true, gmail: true, display: false, maps: false,
} as const;

/** DG4 — la France (2250) : les DROM n'en descendent pas dans l'arbre des lieux de Google (cadrage, §2.3). */
export const FRANCE_METROPOLITAINE: readonly string[] = ['geoTargetConstants/2250'];
export const LANGUE_DG = 'languageConstants/1002';

/** DG7 — le nom d'entreprise d'une annonce, posé par le serveur. */
export const NOM_ENTREPRISE = 'Luminose';

/** DG7 — les limites de l'annonce multi-élément (`DemandGenMultiAssetAdInfo`, référence v25). */
export const LIMITES_DG = { titre: 30, titresMax: 5, description: 90, descriptionsMax: 5, logosMax: 5, imagesMax: 20 } as const;

/** DG7 — chaque champ d'image : son ratio (±1 %) et sa taille minimale, en pixels. */
export const IMAGES_DG = {
  paysage: { champ: 'marketingImages', ratio: 1.91, min: [600, 314], nom: 'paysage 1,91:1' },
  carre: { champ: 'squareMarketingImages', ratio: 1, min: [300, 300], nom: 'carrée 1:1' },
  portrait: { champ: 'portraitMarketingImages', ratio: 4 / 5, min: [480, 600], nom: 'portrait 4:5' },
  vertical: { champ: 'tallPortraitMarketingImages', ratio: 9 / 16, min: [600, 1067], nom: 'verticale 9:16' },
  logo: { champ: 'logoImages', ratio: 1, min: [128, 128], nom: 'logo 1:1' },
} as const;
export type FormatImage = keyof typeof IMAGES_DG;

/**
 * DG7, H — le bouton de l'annonce (« call to action ») : une liste fermée,
 * tirée de `CallToActionType`. L'annonce multi-élément le prend en texte
 * (`call_to_action_text`, texte libre dans la référence) : c'est ce texte qui
 * part, à confirmer au premier aperçu. « Bouton » et non « appel à l'action » :
 * dans ce dépôt, le mot désigne une action IA du catalogue (outils.ts).
 */
export const BOUTONS = {
  LEARN_MORE: { texte: 'Learn more', fr: 'En savoir plus' },
  BOOK_NOW: { texte: 'Book now', fr: 'Réserver' },
  SHOP_NOW: { texte: 'Shop now', fr: 'Acheter' },
  BUY_NOW: { texte: 'Buy now', fr: 'Acheter maintenant' },
  CONTACT_US: { texte: 'Contact us', fr: 'Nous contacter' },
  SIGN_UP: { texte: 'Sign up', fr: "S'inscrire" },
  SEE_MORE: { texte: 'See more', fr: 'Voir plus' },
} as const;
export type Bouton = keyof typeof BOUTONS;

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

/** Pour les tests : chaque cas repart d'un isolat neuf — Tag Manager compris. */
export const oublierJetonAds = oublierJetonsGoogle;

/** Le renouvellement est commun à Google Ads et à Tag Manager : jeton-google.ts. */
const jetonAcces = (env: Env): Promise<string> =>
  jetonGoogle(env, exigerSecret(env.GOOGLE_ADS_REFRESH_TOKEN, 'GOOGLE_ADS_REFRESH_TOKEN'), 'GOOGLE_ADS_REFRESH_TOKEN',
    'workers/mcp/scripts/jeton-google-ads.mjs');

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

const euros = (env: Env, nom: 'ADS_BUDGET_MAX_JOUR' | 'ADS_BUDGET_MAX_TOTAL' | 'ADS_CPC_MAX' | 'ADS_BUDGET_MAX_CAMPAGNE'): number => {
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

export type LimitesDG = Limites & { budgetMaxCampagne: number };

/** DG1 — les plafonds de Demand Gen : ceux du Search, plus le budget total d'une campagne. */
export const limitesDG = (env: Env): LimitesDG => ({ ...limitesArgent(env), budgetMaxCampagne: euros(env, 'ADS_BUDGET_MAX_CAMPAGNE') });

/**
 * DG3 — `ADS_OBJECTIFS_CONVERSION`, « clé:id,clé:id » : les objectifs
 * personnalisés que Florent a créés. Vide ou mal formé, la création de
 * campagne Demand Gen est fermée — une liste illisible n'est pas « tout permis ».
 */
export const objectifsDG = (env: Env): Map<string, string> => {
  const brut = (env.ADS_OBJECTIFS_CONVERSION ?? '').trim();
  const fermer = (pourquoi: string): never => {
    throw new Refus(`ADS_OBJECTIFS_CONVERSION ${pourquoi} dans wrangler.toml : la création de campagne Demand Gen est fermée. ` +
      'Florent y pose ses objectifs personnalisés, « clé:id,clé:id » (Google Ads → Objectifs → objectifs personnalisés).', 503);
  };
  if (!brut) fermer('est vide');
  const objectifs = new Map<string, string>();
  for (const entree of brut.split(',')) {
    const m = /^\s*([a-z0-9][a-z0-9_-]{0,39})\s*:\s*(\d{1,20})\s*$/.exec(entree);
    if (!m || objectifs.has(m[1])) fermer('est illisible');
    objectifs.set(m![1], m![2]);
  }
  return objectifs;
};

export type ZoneDG = 'france_metropolitaine' | 'locale';

/**
 * DG4 — les deux préréglages de zone. `locale` vient de `ADS_ZONE_LOCALE`
 * (des `geoTargetConstants`) ; vide, il est fermé. Mal formé, tout est fermé.
 */
export const zonesDG = (env: Env): Record<ZoneDG, readonly string[]> => {
  const brut = (env.ADS_ZONE_LOCALE ?? '').trim();
  const ids = brut ? brut.split(',').map((x) => x.trim()) : [];
  if (ids.some((x) => !/^\d{1,20}$/.test(x)) || new Set(ids).size !== ids.length) {
    throw new Refus('ADS_ZONE_LOCALE est illisible dans wrangler.toml (des identifiants de lieux, séparés par des virgules) : Demand Gen est fermé.', 503);
  }
  return { france_metropolitaine: FRANCE_METROPOLITAINE, locale: ids.map((x) => `geoTargetConstants/${x}`) };
};

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
const FORMES: Record<Exclude<Forme, 'creer-campagne' | 'creer-liste' | 'creer-elements' | 'creer-campagne-dg' | 'creer-groupe-dg'>, (service: ServiceEcriture, op: Operation) => string | null> = {
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
    // En pause, ou active sur une campagne en pause — ce que `verifierActivations` demande au compte.
    if (!STATUTS_NAISSANCE.includes(String(c.status))) return `statut ${String(c.status)}`;
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

  'creer-annonce-dg': (_service, op) => {
    if (cles(op) !== 'create') return `clés ${cles(op)}`;
    const c = op.create as Record<string, unknown>;
    if (cles(c) !== 'ad,adGroup,adGroupAdAssetAutomationSettings,status') return `champs ${cles(c)}`;
    if (c.status !== 'PAUSED') return `statut ${String(c.status)}`;
    if (!ressource('adGroups').test(String(c.adGroup))) return 'groupe';
    if (automatismes(c.adGroupAdAssetAutomationSettings) !== coupes(AUTOMATISMES_DG_ANNONCE)) return 'automatismes : tous coupés (DG6)';
    const ad = c.ad as Record<string, unknown>;
    if (!['demandGenMultiAssetAd,finalUrls', 'demandGenMultiAssetAd,finalUrls,name'].includes(cles(ad))) return `annonce : champs ${cles(ad)}`;
    if ('name' in ad && !longueur(ad.name, 100)) return 'annonce : nom';
    const urls = ad.finalUrls;
    if (!Array.isArray(urls) || urls.length !== 1 || typeof urls[0] !== 'string' || !urlAdmise(urls[0])) return 'URL finale hors de luminose.fr (V6)';
    return refusMultiElement(ad.demandGenMultiAssetAd);
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
    if (forme === 'creer-campagne' || forme === 'creer-liste' || forme === 'creer-elements' || forme === 'creer-campagne-dg' || forme === 'creer-groupe-dg') {
      raisons.push(`${forme} : passer par muter`);
      continue;
    }
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
    if (cles(a) !== 'calloutText' || !texte(a.calloutText, LIMITES_ELEMENTS.infoBulle)) return 'info-bulle';
    textes = [String(a.calloutText)];
  } else if (cles(corps) === 'structuredSnippetAsset') {
    const e = corps.structuredSnippetAsset as Record<string, unknown>;
    if (cles(e) !== 'header,values') return 'extrait : champs';
    if (!(EN_TETES_EXTRAITS as readonly string[]).includes(String(e.header))) return `extrait : en-tête ${String(e.header)} hors de la liste de Google`;
    const v = e.values;
    if (!Array.isArray(v) || v.length < LIMITES_ELEMENTS.valeursMin || v.length > LIMITES_ELEMENTS.valeursMax ||
        !v.every((x) => texte(x, LIMITES_ELEMENTS.valeur)) || new Set(v.map((x) => String(x).toLowerCase())).size !== v.length) return 'extrait : valeurs';
    textes = v as string[];
  } else if (cles(corps) === 'priceAsset') {
    const p = corps.priceAsset as Record<string, unknown>;
    if (!estObjet(p) || !['languageCode,priceOfferings,type', 'languageCode,priceOfferings,priceQualifier,type'].includes(cles(p))) return 'prix : champs';
    if (p.languageCode !== 'fr') return `prix : langue ${String(p.languageCode)}`;
    if (!(String(p.type) in TYPES_PRIX)) return `prix : type ${String(p.type)}`;
    if ('priceQualifier' in p && !(String(p.priceQualifier) in QUALIFICATIFS_PRIX)) return `prix : qualificatif ${String(p.priceQualifier)}`;
    const lignes = p.priceOfferings;
    if (!Array.isArray(lignes) || lignes.length < LIMITES_ELEMENTS.prixLignesMin || lignes.length > LIMITES_ELEMENTS.prixLignesMax) return 'prix : nombre de lignes';
    textes = [];
    for (const l of lignes as Record<string, unknown>[]) {
      if (!estObjet(l) || !['description,finalUrl,header,price', 'description,finalUrl,header,price,unit'].includes(cles(l))) return 'prix : champs d\'une ligne';
      if (!texte(l.header, LIMITES_ELEMENTS.prixTitre) || !texte(l.description, LIMITES_ELEMENTS.prixDescription)) return 'prix : titre ou description';
      if ('unit' in l && !(String(l.unit) in UNITES_PRIX)) return `prix : unité ${String(l.unit)}`;
      const m = l.price as Record<string, unknown>;
      if (!estObjet(m) || cles(m) !== 'amountMicros,currencyCode' || m.currencyCode !== 'EUR' || !/^[1-9]\d{0,14}$/.test(String(m.amountMicros))) return 'prix : montant';
      if (typeof l.finalUrl !== 'string' || !urlAdmise(l.finalUrl)) return 'prix : URL finale hors de luminose.fr';
      textes.push(String(l.header), String(l.description));
    }
    if (new Set((lignes as Record<string, unknown>[]).map((l) => String(l.header).toLowerCase())).size !== lignes.length) return 'prix : titre en double';
  } else {
    return `type d'élément ${cles(corps)}`;
  }
  const { refus } = examinerAnnonce(textes);
  return refus.length ? `texte refusé (V4) : ${refus.join(' ; ')}` : null;
};

/** Le type de champ qu'un élément occupe, d'après sa forme. */
const typeElement = (element: Record<string, unknown>): TypeElement | null =>
  'sitelinkAsset' in element ? 'SITELINK' : 'calloutAsset' in element ? 'CALLOUT' : 'structuredSnippetAsset' in element ? 'STRUCTURED_SNIPPET'
    : 'priceAsset' in element ? 'PRICE' : null;

/**
 * La requête atomique qui crée des éléments d'annonce : les éléments d'abord,
 * puis une association par élément, toutes vers la même cible, au même statut
 * de naissance et au type de champ de son élément. Rien d'autre.
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
  const statuts = new Set<string>();
  for (const o of operations.slice(n)) {
    const op = o[lien] as Record<string, unknown>;
    if (cles(op) !== 'create') refuser('association : seule la création');
    const c = op.create as Record<string, unknown>;
    if (cles(c) !== ['asset', champ, 'fieldType', 'status'].sort().join(',')) refuser(`association : champs ${cles(c)}`);
    if (!STATUTS_NAISSANCE.includes(String(c.status))) refuser(`association : statut ${String(c.status)}`);
    if (!ressource(type).test(String(c[champ]))) refuser(`association : ${champ}`);
    if (crees.get(String(c.asset)) !== c.fieldType) refuser('association : élément ou type de champ');
    cibles.add(String(c[champ]));
    lies.add(String(c.asset));
    statuts.add(String(c.status));
  }
  if (cibles.size !== 1 || lies.size !== n) refuser('chaque élément créé, associé une fois, à une seule cible');
  if (statuts.size !== 1) refuser('un seul statut de naissance pour toutes les associations');
};

// ── Demand Gen (cadrage du 07/10/2026) ───────────────────────────────────

/** Les automatismes d'une liste de réglages, triés : « TYPE:STATUT,… ». */
const automatismes = (v: unknown): string => (Array.isArray(v)
  ? (v as Record<string, unknown>[]).map((a) => (estObjet(a) && cles(a) === 'assetAutomationStatus,assetAutomationType'
    ? `${String(a.assetAutomationType)}:${String(a.assetAutomationStatus)}` : '?')).sort().join(',')
  : '');
const coupes = (types: readonly string[]): string => types.map((t) => `${t}:OPTED_OUT`).sort().join(',');

/** Égalité de deux objets plats, quel que soit l'ordre des clés. */
const memesChamps = (a: unknown, b: Record<string, unknown>): boolean =>
  estObjet(a) && cles(a) === cles(b) && Object.keys(b).every((k) => a[k] === b[k]);

/**
 * DG7 — l'annonce multi-élément : « Luminose » pour nom d'entreprise, des
 * textes dans les limites et sans terme refusé (V4), des images désignées par
 * nom de ressource, dans leurs champs, sans image de Display classique.
 */
const refusMultiElement = (v: unknown): string | null => {
  if (!estObjet(v)) return 'multi-élément : absent';
  const permis = ['businessName', 'callToActionText', 'descriptions', 'headlines', ...Object.values(IMAGES_DG).map((f) => f.champ)];
  if (Object.keys(v).some((k) => !permis.includes(k))) return `multi-élément : champs ${cles(v)}`;
  if (v.businessName !== NOM_ENTREPRISE) return `nom d'entreprise ${String(v.businessName)} — « ${NOM_ENTREPRISE} » seulement`;
  const textes = (x: unknown, max: number, nombre: number): string[] | null => (Array.isArray(x) && x.length >= 1 && x.length <= nombre &&
    x.every((t) => estObjet(t) && cles(t) === 'text' && longueur(t.text, max) && !/[{}]/.test(String(t.text)))
    ? (x as { text: string }[]).map((t) => t.text) : null);
  const titres = textes(v.headlines, LIMITES_DG.titre, LIMITES_DG.titresMax);
  const descriptions = textes(v.descriptions, LIMITES_DG.description, LIMITES_DG.descriptionsMax);
  if (!titres || !descriptions) return 'multi-élément : titres ou descriptions';
  const images = (x: unknown) => Array.isArray(x) && x.every((i) => estObjet(i) && cles(i) === 'asset' && ressource('assets').test(String(i.asset)));
  for (const f of Object.values(IMAGES_DG)) if (f.champ in v && (!images(v[f.champ]) || (v[f.champ] as unknown[]).length === 0)) return `multi-élément : ${f.champ}`;
  const n = (champ: string) => (Array.isArray(v[champ]) ? (v[champ] as unknown[]).length : 0);
  if (n(IMAGES_DG.logo.champ) < 1 || n(IMAGES_DG.logo.champ) > LIMITES_DG.logosMax) return 'multi-élément : 1 à 5 logos';
  if (n(IMAGES_DG.paysage.champ) + n(IMAGES_DG.carre.champ) === 0) return 'multi-élément : une image paysage ou carrée au moins';
  if (['paysage', 'carre', 'portrait', 'vertical'].reduce((t, f) => t + n(IMAGES_DG[f as FormatImage].champ), 0) > LIMITES_DG.imagesMax) return 'multi-élément : 20 images au plus';
  if ('callToActionText' in v && !Object.values(BOUTONS).some((a) => a.texte === v.callToActionText)) return `bouton ${String(v.callToActionText)}`;
  const { refus } = examinerAnnonce([...titres, ...descriptions]);
  return refus.length ? `texte refusé (V4) : ${refus.join(' ; ')}` : null;
};

/**
 * DG1, DG2, DG3, DG6, DG8 — la requête atomique qui crée une campagne Demand
 * Gen : un budget TOTAL, la campagne, sa configuration d'objectif. Les
 * plafonds sont revérifiés ici — budget total, équivalent quotidien, CPC —,
 * l'engagement par l'outil, qui lit le compte.
 */
export const verifierCreationCampagneDG = (operations: Operation[], limites: LimitesDG, objectifs: readonly string[]): void => {
  const refuser = (raison: string): never => {
    throw new Error(`Opération refusée par la table fermée (googleAds) — creer-campagne-dg : ${raison}`);
  };
  const types = operations.map((o) => cles(o)).join(' → ');
  if (types !== 'campaignBudgetOperation → campaignOperation → conversionGoalCampaignConfigOperation') refuser(`suite d'opérations ${types}`);

  const budget = operations[0].campaignBudgetOperation as Record<string, unknown>;
  if (cles(budget) !== 'create') refuser('budget : seule la création');
  const b = budget.create as Record<string, unknown>;
  if (cles(b) !== 'deliveryMethod,explicitlyShared,name,period,resourceName,totalAmountMicros') refuser(`budget : champs ${cles(b)}`);
  if (!ressource('campaignBudgets', true).test(String(b.resourceName))) refuser('budget : nom de ressource temporaire');
  if (!marque(b.name)) refuser('budget : nom sans la marque [Claude]');
  if (b.deliveryMethod !== 'STANDARD') refuser('budget : livraison');
  if (b.explicitlyShared !== false) refuser('budget partagé');
  if (b.period !== 'CUSTOM_PERIOD') refuser('budget : total seulement (CUSTOM_PERIOD)');
  const total = Number(b.totalAmountMicros);
  if (!Number.isInteger(total) || total <= 0 || total % 10_000 !== 0 || total > limites.budgetMaxCampagne) {
    refuser(`budget total ${String(b.totalAmountMicros)} au-delà du plafond par campagne`);
  }

  const campagne = operations[1].campaignOperation as Record<string, unknown>;
  if (cles(campagne) !== 'create') refuser('campagne : seule la création');
  const c = campagne.create as Record<string, unknown>;
  // Pas d'`assetAutomationSettings` : Demand Gen les refuse à la campagne (DG6).
  const communs = ['advertisingChannelType', 'campaignBudget', 'containsEuPoliticalAdvertising',
    'demandGenCampaignSettings', 'endDateTime', 'geoTargetTypeSetting', 'name', 'resourceName', 'startDateTime', 'status'];
  if (!['targetSpend', 'targetCpc', 'maximizeConversions'].some((e) => [...communs, e].sort().join(',') === cles(c))) refuser(`campagne : champs ${cles(c)}`);
  if (c.status !== 'PAUSED') refuser(`campagne : statut ${String(c.status)}`);
  if (c.advertisingChannelType !== 'DEMAND_GEN') refuser('campagne : Demand Gen seulement');
  if (!marque(c.name)) refuser('campagne : nom sans la marque [Claude]');
  if (!ressource('campaigns', true).test(String(c.resourceName))) refuser('campagne : nom de ressource temporaire');
  if (c.campaignBudget !== b.resourceName) refuser('campagne : budget');
  if (c.containsEuPoliticalAdvertising !== 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING') refuser('campagne : déclaration UE');
  if (!memesChamps(c.demandGenCampaignSettings, { upgradedTargeting: true })) refuser('campagne : ciblage au groupe');
  if (!memesChamps(c.geoTargetTypeSetting, { positiveGeoTargetType: 'PRESENCE', negativeGeoTargetType: 'PRESENCE' })) refuser('campagne : présence réelle');

  // DG1 — des dates, l'une et l'autre, et l'équivalent quotidien sous son plafond.
  const debut = /^(\d{4}-\d{2}-\d{2}) 00:00:00$/.exec(String(c.startDateTime))?.[1];
  const fin = /^(\d{4}-\d{2}-\d{2}) 23:59:59$/.exec(String(c.endDateTime))?.[1];
  if (!debut || !fin || !dateValide(debut) || !dateValide(fin)) refuser('campagne : dates de début et de fin');
  if (debut! < aujourdhui() || fin! < debut!) refuser('campagne : dates hors bornes');
  if (equivalentQuotidien(total, debut!, fin!) > limites.budgetMaxJour) refuser('campagne : équivalent quotidien au-delà du plafond');

  // DG2 — Maximiser les clics sans plafond (Google refuse le plafond en Demand
  // Gen), CPC cible plafonné par ADS_CPC_MAX, ou Maximiser les conversions sans cible.
  if ('targetSpend' in c) {
    if (!estObjet(c.targetSpend) || cles(c.targetSpend) !== '') refuser('campagne : Maximiser les clics, sans plafond ni montant cible');
  } else if ('targetCpc' in c) {
    const t = c.targetCpc as Record<string, unknown>;
    const cpc = Number(t?.targetCpcMicros);
    if (!estObjet(t) || cles(t) !== 'targetCpcMicros' || !Number.isInteger(cpc) || cpc <= 0 || cpc % 10_000 !== 0 || cpc > limites.cpcMax) {
      refuser('campagne : CPC cible absent ou au-delà du plafond');
    }
  } else if (cles(c.maximizeConversions) !== '') {
    refuser('campagne : Maximiser les conversions, sans CPA ni ROAS cible');
  }

  // DG3 — l'objectif de la campagne, l'un de ceux que Florent a posés.
  const config = operations[2].conversionGoalCampaignConfigOperation as Record<string, unknown>;
  if (cles(config) !== 'update,updateMask' || config.updateMask !== 'customConversionGoal,goalConfigLevel') refuser('objectif : mise à jour seulement');
  const k = config.update as Record<string, unknown>;
  const idCampagne = /\/campaigns\/(-\d+)$/.exec(String(c.resourceName))?.[1];
  if (cles(k) !== 'customConversionGoal,goalConfigLevel,resourceName') refuser(`objectif : champs ${cles(k)}`);
  if (k.resourceName !== String(c.resourceName).replace(/\/campaigns\/-\d+$/, `/conversionGoalCampaignConfigs/${idCampagne}`)) refuser('objectif : campagne');
  if (k.goalConfigLevel !== 'CAMPAIGN') refuser('objectif : au niveau de la campagne');
  const objectif = /^customers\/\d{10}\/customConversionGoals\/(\d+)$/.exec(String(k.customConversionGoal))?.[1];
  if (!objectif || !objectifs.includes(objectif)) refuser('objectif hors de ADS_OBJECTIFS_CONVERSION');
};

/**
 * DG4, DG5, DG8 — la requête atomique qui crée un groupe Demand Gen : le
 * groupe et ses canaux, puis ses critères — les lieux d'UN préréglage, tous et
 * eux seuls, et le français. Rien d'autre.
 */
export const verifierCreationGroupeDG = (operations: Operation[], zones: Record<ZoneDG, readonly string[]>): void => {
  const refuser = (raison: string): never => {
    throw new Error(`Opération refusée par la table fermée (googleAds) — creer-groupe-dg : ${raison}`);
  };
  const types = operations.map((o) => cles(o));
  if (types[0] !== 'adGroupOperation' || types.slice(1).some((t) => t !== 'adGroupCriterionOperation')) refuser(`suite d'opérations ${types.join(' → ')}`);
  const groupe = operations[0].adGroupOperation as Record<string, unknown>;
  if (cles(groupe) !== 'create') refuser('groupe : seule la création');
  const g = groupe.create as Record<string, unknown>;
  if (cles(g) !== 'campaign,demandGenAdGroupSettings,name,resourceName,status') refuser(`groupe : champs ${cles(g)}`);
  if (g.status !== 'PAUSED') refuser(`groupe : statut ${String(g.status)}`);
  if (!marque(g.name)) refuser('groupe : nom sans la marque [Claude]');
  if (!ressource('adGroups', true).test(String(g.resourceName))) refuser('groupe : nom de ressource temporaire');
  if (!ressource('campaigns').test(String(g.campaign))) refuser('groupe : campagne');
  const reglages = g.demandGenAdGroupSettings as Record<string, unknown>;
  const controles = estObjet(reglages) && cles(reglages) === 'channelControls' ? reglages.channelControls as Record<string, unknown> : undefined;
  if (!estObjet(controles) || cles(controles) !== 'selectedChannels' || !memesChamps(controles.selectedChannels, CANAUX_DG)) {
    refuser('groupe : canaux — YouTube, Discover, Gmail ; ni Display ni Maps (DG5)');
  }

  const lieux: string[] = [];
  const langues: string[] = [];
  for (const o of operations.slice(1)) {
    const op = o.adGroupCriterionOperation as Record<string, unknown>;
    if (cles(op) !== 'create') refuser('critère : seule la création');
    const k = op.create as Record<string, unknown>;
    if (k.adGroup !== g.resourceName) refuser('critère : groupe');
    if (cles(k) === 'adGroup,location' && cles(k.location) === 'geoTargetConstant') lieux.push(String((k.location as Record<string, unknown>).geoTargetConstant));
    else if (cles(k) === 'adGroup,language' && cles(k.language) === 'languageConstant') langues.push(String((k.language as Record<string, unknown>).languageConstant));
    else refuser(`critère : ${cles(k)}`);
  }
  if (langues.length !== 1 || langues[0] !== LANGUE_DG) refuser('langue : le français, une fois');
  const ensemble = (x: readonly string[]) => [...x].sort().join(',');
  if (!lieux.length || !Object.values(zones).some((z) => ensemble(z) === ensemble(lieux))) refuser('lieux hors des préréglages (DG4)');
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
/**
 * Une association d'élément d'annonce ne naît ACTIVE que si sa campagne — ou
 * celle de son groupe — est EN PAUSE, et c'est le compte qui le dit, avant
 * chaque envoi : l'outil l'a lu à l'aperçu, mais Florent a pu activer la
 * campagne depuis. Active, elle ferait dépenser une association que personne
 * n'a relue. Une lecture par appel : toutes les associations d'un appel visent
 * la même cible.
 */
const verifierActivations = async (env: Env, compte: string, service: ServiceEcriture, operations: Operation[]): Promise<void> => {
  const creations = operations.flatMap((o): Record<string, unknown>[] => {
    const op = (service === 'googleAds' ? o.campaignAssetOperation ?? o.adGroupAssetOperation : ['campaignAssets', 'adGroupAssets'].includes(service) ? o : undefined) as Record<string, unknown> | undefined;
    return op && estObjet(op.create) ? [op.create as Record<string, unknown>] : [];
  });
  const actives = creations.filter((c) => c.status === 'ENABLED');
  if (actives.length === 0) return;
  const id = (nom: unknown) => /\/(\d+)$/.exec(String(nom))?.[1];
  const campagnes = [...new Set(actives.flatMap((c) => (c.campaign ? [id(c.campaign)] : [])))];
  const groupes = [...new Set(actives.flatMap((c) => (c.adGroup ? [id(c.adGroup)] : [])))];
  if ([...campagnes, ...groupes].some((x) => !x)) throw new Error('Association active : cible illisible');
  type Ligne = { campaign?: { id?: string; name?: string; status?: string }; adGroup?: { id?: string } };
  const lire = async (requete: string) => ((await rechercher(env, compte, requete, connexionPour(env, compte))).results ?? []) as Ligne[];
  const lues = [
    ...(campagnes.length ? await lire(`SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.id IN (${campagnes.join(', ')})`) : []),
    ...(groupes.length ? await lire(`SELECT ad_group.id, campaign.id, campaign.name, campaign.status FROM ad_group WHERE ad_group.id IN (${groupes.join(', ')})`) : []),
  ];
  for (const cible of [...campagnes.map((c) => ({ c })), ...groupes.map((g) => ({ g }))]) {
    const l = lues.find((x) => ('c' in cible ? String(x.campaign?.id) === cible.c : String(x.adGroup?.id) === cible.g));
    if (l?.campaign?.status !== 'PAUSED') {
      throw new Refus(`La campagne « ${l?.campaign?.name ?? '?'} » n'est pas en pause (${l?.campaign?.status ?? 'introuvable'}) : une association ` +
        "active y ferait dépenser ce que personne n'a relu. Rien n'est parti. Refaites un aperçu : l'association y naîtra en pause.");
    }
  }
};

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
    const canal = ((operations[1]?.campaignOperation as Record<string, unknown> | undefined)?.create as Record<string, unknown> | undefined)?.advertisingChannelType;
    if (premiere === 'sharedSetOperation') verifierCreationListe(operations);
    else if (premiere === 'assetOperation') verifierCreationElements(operations);
    else if (premiere === 'adGroupOperation') verifierCreationGroupeDG(operations, zonesDG(env));
    else if (canal === 'DEMAND_GEN') verifierCreationCampagneDG(operations, limitesDG(env), [...objectifsDG(env).values()]);
    else verifierCreationCampagne(operations, limitesArgent(env));
  } else {
    for (const operation of operations) verifierOperation(service, operation);
    await verifierRetraits(env, compte, service, operations);
  }
  await verifierActivations(env, compte, service, operations);
  const champ = service === 'googleAds' ? 'mutateOperations' : 'operations';
  return await appeler(env, `/customers/${compte}/${service}:mutate`, {
    corps: { [champ]: operations, validateOnly, partialFailure: false },
    connexion: connexionPour(env, compte),
  }) as ReponseMutation;
};
