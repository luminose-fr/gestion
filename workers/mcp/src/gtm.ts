/**
 * Couche D — le Worker vers Google Tag Manager (décisions du 08/10/2026,
 * decisions/2026-10-08-gtm.md, du 09/10/2026, decisions/2026-10-09-gtm-ecriture.md,
 * et du 11/10/2026, decisions/2026-10-11-gtm-modifier.md).
 * Ce lot LIT le conteneur du site et le compare aux conversions Google Ads ;
 * il CRÉE, dans un espace de travail « [Claude] », des déclencheurs et des
 * balises que Florent relit et publie ; il y MODIFIE une balise existante de
 * trois façons, et de trois seulement. Il ne publie rien.
 *
 * Les verrous, du plus solide au plus fragile :
 * - DEUX JETONS. Celui de lecture (`GTM_REFRESH_TOKEN`) n'a que le scope
 *   `tagmanager.readonly`. Celui d'écriture (`GTM_ECRITURE_REFRESH_TOKEN`)
 *   n'a que `tagmanager.edit.containers` : créer dans un espace de travail,
 *   ni créer une version ni publier — Google refuserait, quoi que fasse ce
 *   code. Les scopes que Google rend sont vérifiés à chaque service du jeton
 *   (`controleLecture`, `controleEcriture`). Tous deux à part de celui de
 *   Google Ads : absents, Tag Manager est fermé et Google Ads continue ; et
 *   l'un ne sert jamais l'autre (jeton-google.ts).
 * - `appeler` ne fait que des GET, avec le jeton de lecture, et seulement sur
 *   les chemins de `cheminPermis` : la liste des conteneurs visibles, la
 *   recherche d'un conteneur par son identifiant public, et le contenu de CE
 *   conteneur — celui de `GTM_CONTENEUR`, dont Google donne le compte et
 *   l'identifiant. `creerGtm` ne fait que des POST, avec le jeton
 *   d'écriture, sur les trois chemins de `cheminEcriturePermis` — créer
 *   l'espace « [Claude] », y créer un déclencheur ou une balise —, d'un corps
 *   que `formeRefusee` accepte. `modifierBaliseGtm` ne fait qu'un PUT, sur
 *   une balise de l'espace « [Claude] » relue à l'instant, avec son empreinte,
 *   d'un corps qui ne diffère de la balise relue que de ce que
 *   `modificationRefusee` permet. Aucune URL de l'API ne se construit ailleurs
 *   que dans ce fichier.
 * - Chaque lecture borne son nombre de requêtes : le quota de l'API Tag
 *   Manager est bas, et une page de plus n'apprendrait rien au modèle.
 */
import { jetonGoogle, type ControleScopes } from './jeton-google';
import { MARQUE } from './regles';
import { Refus } from './refus';
import type { Env } from './env';

const API = 'https://tagmanager.googleapis.com/tagmanager/v2';

/** Le seul scope que le jeton de lecture doit porter (scripts/jeton-google-ads.mjs gtm). */
export const SCOPE_GTM = 'https://www.googleapis.com/auth/tagmanager.readonly';

/**
 * Le seul scope d'écriture que le jeton d'écriture doit porter
 * (scripts/jeton-google-ads.mjs gtm-ecriture) : créer dans un espace de
 * travail. Créer une version exige `tagmanager.edit.containerversions`, publier
 * `tagmanager.publish` (document de découverte, révision 20261007) : ce jeton
 * n'a ni l'un ni l'autre (G6).
 */
export const SCOPE_GTM_ECRITURE = 'https://www.googleapis.com/auth/tagmanager.edit.containers';

/** Le seul espace de travail où le serveur écrit (G7). Florent le publie, ou le supprime. */
export const ESPACE_CLAUDE = MARQUE;

/** L'identifiant public d'un conteneur web, tel qu'il figure dans le code du site. */
export const FORME_CONTENEUR = /^GTM-[A-Z0-9]{4,12}$/;

const SCRIPT = 'node workers/mcp/scripts/jeton-google-ads.mjs gtm';
const SCRIPT_ECRITURE = 'node workers/mcp/scripts/jeton-google-ads.mjs gtm-ecriture';

/** Au-delà, une liste s'arrête et le dit. */
const MAX_PAGES = 5;
/** La découverte des conteneurs visibles ne parcourt pas plus de comptes. */
const MAX_COMPTES = 5;

// ── Ce que l'API rend ────────────────────────────────────────────────────

export type Parametre = { type?: string; key?: string; value?: string; list?: Parametre[]; map?: Parametre[] };
export type Condition = { type?: string; parameter?: Parametre[] };
export type Balise = {
  tagId?: string; name?: string; tagManagerUrl?: string; type?: string; paused?: boolean; parameter?: Parametre[];
  firingTriggerId?: string[]; blockingTriggerId?: string[]; tagFiringOption?: string;
  consentSettings?: { consentStatus?: string; consentType?: Parametre };
  setupTag?: { tagName?: string }[]; teardownTag?: { tagName?: string }[];
  notes?: string; fingerprint?: string;
};
export type Declencheur = {
  triggerId?: string; name?: string; tagManagerUrl?: string; type?: string; parameter?: Parametre[];
  filter?: Condition[]; customEventFilter?: Condition[]; autoEventFilter?: Condition[];
};
export type Variable = { variableId?: string; name?: string; type?: string; parameter?: Parametre[] };
export type Conteneur = {
  accountId: string; containerId: string; publicId: string;
  name?: string; domainName?: string[]; tagManagerUrl?: string;
};
export type Espace = { workspaceId?: string; name?: string; description?: string; tagManagerUrl?: string };
export type Modification = { changeStatus?: string; tag?: Balise; trigger?: Declencheur; variable?: Variable; folder?: { name?: string } };

/** Ce qu'un conteneur exécute — sa version en ligne, ou un espace de travail. */
export type Contenu = {
  /** « la version en ligne n° 12 », « l'espace de travail « Default Workspace » (3) ». */
  source: string;
  balises: Balise[];
  declencheurs: Declencheur[];
  variables: Variable[];
  /** Les variables intégrées activées : {{Page Path}}, {{Click URL}}… */
  integrees: string[];
  /** Une liste coupée à MAX_PAGES. */
  tronque: boolean;
};

// ── La table fermée des chemins ──────────────────────────────────────────

const DECOUVERTE: RegExp[] = [
  /^\/accounts$/,
  /^\/accounts\/\d{1,20}\/containers$/,
  /^\/accounts\/containers:lookup\?tagId=GTM-[A-Z0-9]{4,12}$/,
];

/** Relatifs au conteneur de `GTM_CONTENEUR` : rien d'un autre conteneur ne se lit. */
const DANS_LE_CONTENEUR: RegExp[] = [
  /^\/versions:live$/,
  /^\/workspaces$/,
  /^\/workspaces\/\d{1,20}\/status$/,
  /^\/workspaces\/\d{1,20}\/(tags|triggers|variables|built_in_variables)(\?pageToken=[A-Za-z0-9%_.~-]{1,500})?$/,
  // Une balise seule : celle qu'on modifie, relue juste avant (11/10/2026).
  /^\/workspaces\/\d{1,20}\/tags\/\d{1,20}$/,
];

/** Un chemin que `appeler` accepte. Exporté pour le test qui le vérifie. */
export const cheminPermis = (chemin: string, c?: Conteneur): boolean => {
  if (DECOUVERTE.some((r) => r.test(chemin))) return true;
  if (!c) return false;
  const base = `/accounts/${c.accountId}/containers/${c.containerId}`;
  return chemin.startsWith(`${base}/`) && DANS_LE_CONTENEUR.some((r) => r.test(chemin.slice(base.length)));
};

// ── Les jetons ───────────────────────────────────────────────────────────

const TAG_MANAGER = /^https:\/\/www\.googleapis\.com\/auth\/tagmanager\./;

/** G1 : de Tag Manager, le jeton de lecture ne porte que la lecture. */
export const controleLecture: ControleScopes = (scopes) => {
  if (!scopes) return 'Google ne dit pas les scopes du jeton de lecture de Tag Manager : Tag Manager est fermé.';
  const deTrop = scopes.filter((x) => TAG_MANAGER.test(x) && x !== SCOPE_GTM);
  if (deTrop.length) return `Le jeton de lecture de Tag Manager porte aussi ${deTrop.join(', ')} : il ne doit porter que ${SCOPE_GTM}. Tag Manager est fermé.`;
  if (!scopes.includes(SCOPE_GTM)) return `Le jeton de lecture de Tag Manager n'a pas le scope ${SCOPE_GTM}.`;
  return null;
};

/**
 * G6 : de Tag Manager, le jeton d'écriture ne porte que la création dans un
 * espace de travail — et la lecture, sans danger. Un scope de version, de
 * publication, de suppression ou de gestion ferme l'écriture : c'est ce qui
 * garantit que rien ne part sur le site sans Florent, quoi que fasse ce code.
 */
export const controleEcriture: ControleScopes = (scopes) => {
  if (!scopes) return 'Google ne dit pas les scopes du jeton d\'écriture de Tag Manager : l\'écriture est fermée.';
  const deTrop = scopes.filter((x) => TAG_MANAGER.test(x) && x !== SCOPE_GTM_ECRITURE && x !== SCOPE_GTM);
  if (deTrop.length) {
    return `Le jeton d'écriture de Tag Manager porte aussi ${deTrop.join(', ')} : il ne doit porter que ${SCOPE_GTM_ECRITURE}, ` +
      'qui ne permet ni de créer une version ni de publier. L\'écriture est fermée.';
  }
  if (!scopes.includes(SCOPE_GTM_ECRITURE)) return `Le jeton d'écriture de Tag Manager n'a pas le scope ${SCOPE_GTM_ECRITURE}.`;
  return null;
};

const jetonLecture = (env: Env): Promise<string> => {
  if (!env.GTM_REFRESH_TOKEN) {
    throw new Refus(
      'Secret GTM_REFRESH_TOKEN absent du Worker MCP : Tag Manager est fermé, Google Ads continue. ' +
      `Sur le Mac : ${SCRIPT}, puis depuis la VM : cd workers/mcp && npx wrangler secret put GTM_REFRESH_TOKEN ` +
      '(voir workers/mcp/README.md).',
      503,
    );
  }
  return jetonGoogle(env, env.GTM_REFRESH_TOKEN, 'GTM_REFRESH_TOKEN', SCRIPT, controleLecture);
};

/**
 * Le jeton d'écriture (G6). Absent : l'écriture est fermée, la lecture
 * continue. Exporté : un outil d'écriture le demande dès l'aperçu, pour ne pas
 * montrer ce qu'il ne pourrait pas exécuter.
 */
export const jetonEcritureGtm = (env: Env): Promise<string> => {
  if (!env.GTM_ECRITURE_REFRESH_TOKEN) {
    throw new Refus(
      'Secret GTM_ECRITURE_REFRESH_TOKEN absent du Worker MCP : l\'écriture dans Tag Manager est fermée, la lecture continue. ' +
      `Sur le Mac : ${SCRIPT_ECRITURE}, puis depuis la VM : cd workers/mcp && npx wrangler secret put GTM_ECRITURE_REFRESH_TOKEN ` +
      '(voir workers/mcp/README.md).',
      503,
    );
  }
  return jetonGoogle(env, env.GTM_ECRITURE_REFRESH_TOKEN, 'GTM_ECRITURE_REFRESH_TOKEN', SCRIPT_ECRITURE, controleEcriture);
};

type Acces = { jeton: (env: Env) => Promise<string>; scope: string; script: string; quoi: string };
const LIRE: Acces = { jeton: jetonLecture, scope: SCOPE_GTM, script: SCRIPT, quoi: 'la lecture' };
const ECRIRE: Acces = { jeton: jetonEcritureGtm, scope: SCOPE_GTM_ECRITURE, script: SCRIPT_ECRITURE, quoi: 'l\'écriture' };

// ── Appels ───────────────────────────────────────────────────────────────

type ErreurGoogle = { error?: { code?: number; message?: string; status?: string } };

/**
 * Un appel à l'API Tag Manager. Les codes de Google deviennent des refus en
 * clair : un 403 veut presque toujours dire « l'API n'est pas activée » ou
 * « le jeton n'a pas le bon scope », et c'est ce qu'il faut lire pour agir.
 * Privé : seuls `appeler`, `creerGtm` et `modifierBaliseGtm`, qui gardent leurs
 * chemins, s'en servent.
 */
const envoyer = async <T>(env: Env, acces: Acces, methode: 'GET' | 'POST' | 'PUT', chemin: string, corps?: unknown): Promise<T> => {
  const reponse = await fetch(API + chemin, {
    method: methode,
    headers: {
      Authorization: `Bearer ${await acces.jeton(env)}`,
      ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
  const texte = await reponse.text();
  if (reponse.ok) return (texte ? JSON.parse(texte) : {}) as T;

  const message = (() => { try { return (JSON.parse(texte) as ErreurGoogle).error?.message; } catch { return undefined; } })() ?? `HTTP ${reponse.status}`;
  if (reponse.status === 401) throw new Refus(`Google refuse le jeton Tag Manager (${message}). Régénérez-le : ${acces.script}.`, 503);
  if (reponse.status === 403) {
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(texte)) {
      throw new Refus(`L'API Tag Manager n'est pas activée dans le projet Google Cloud du client OAuth (${message}). ` +
        'L\'activer : console Google Cloud → API et services → « Tag Manager API ».', 503);
    }
    if (/insufficient authentication scopes/i.test(message)) {
      throw new Refus(`Le jeton Tag Manager n'a pas le scope ${acces.scope}. Régénérez-le : ${acces.script}.`, 503);
    }
    throw new Refus(`Tag Manager refuse ${acces.quoi} (${message}) : le compte Google du jeton a-t-il accès à ce conteneur` +
      `${methode === 'GET' ? '' : ', avec le droit « Modifier »'} ?`, 403);
  }
  if (reponse.status === 404) throw new Refus(`Introuvable dans Tag Manager (${message}).`, 404);
  if (reponse.status === 429) throw new Refus(`Quota de l'API Tag Manager atteint (${message}) : réessayer dans une minute.`, 503);
  // Une écriture que Tag Manager juge invalide — un nom déjà pris, un déclencheur
  // inconnu, une empreinte qui n'est plus celle de la balise — n'a rien changé :
  // c'est un refus, que l'appelant peut corriger.
  if (methode === 'POST' && (reponse.status === 400 || reponse.status === 409)) {
    throw new Refus(`Tag Manager refuse la création (${message}).`, reponse.status);
  }
  // 409 ou 412 : l'empreinte n'est plus celle de la balise — elle a changé entre la relecture et l'envoi.
  if (methode === 'PUT' && [400, 409, 412].includes(reponse.status)) {
    throw new Refus(`Tag Manager refuse la modification (${message}).`, reponse.status === 400 ? 400 : 409);
  }
  throw new Error(`Tag Manager : HTTP ${reponse.status} — ${message}`);
};

/** Un GET, avec le jeton de lecture, sur un chemin de la table. */
const appeler = async <T>(env: Env, chemin: string, c?: Conteneur): Promise<T> => {
  // La garde ne dépend pas de l'appelant : même un chemin assemblé de travers
  // plus haut ne sort pas d'ici.
  if (!cheminPermis(chemin, c)) throw new Error(`Chemin refusé par la couche D : ${chemin}`);
  return envoyer<T>(env, LIRE, 'GET', chemin);
};

/** Les pages d'une liste, MAX_PAGES au plus. */
const lister = async <T>(env: Env, chemin: string, champ: string, c: Conteneur): Promise<{ elements: T[]; tronque: boolean }> => {
  const elements: T[] = [];
  let page: string | undefined;
  for (let n = 0; n < MAX_PAGES; n++) {
    const corps = await appeler<Record<string, unknown>>(env, page ? `${chemin}?pageToken=${encodeURIComponent(page)}` : chemin, c);
    elements.push(...((corps[champ] as T[] | undefined) ?? []));
    page = corps.nextPageToken as string | undefined;
    if (!page) return { elements, tronque: false };
  }
  return { elements, tronque: true };
};

// ── Le conteneur ─────────────────────────────────────────────────────────

/**
 * Le compte et l'identifiant du conteneur, que Google donne pour son
 * identifiant public. Gardés dans l'isolat : ils ne changent pas, et le quota
 * est bas. Indexés par le refresh token aussi : un autre jeton peut ne pas
 * voir le même conteneur.
 */
const resolus = new Map<string, Conteneur>();

/** Pour les tests. */
export const oublierConteneursGtm = () => { resolus.clear(); };

/** Les conteneurs que le compte du jeton voit — pour choisir `GTM_CONTENEUR`. 1 + MAX_COMPTES requêtes au plus. */
const conteneursVisibles = async (env: Env): Promise<string[]> => {
  const { account = [] } = await appeler<{ account?: { accountId?: string; name?: string }[] }>(env, '/accounts');
  const lignes: string[] = [];
  for (const a of account.filter((x) => /^\d{1,20}$/.test(x.accountId ?? '')).slice(0, MAX_COMPTES)) {
    const { container = [] } = await appeler<{ container?: Partial<Conteneur>[] }>(env, `/accounts/${a.accountId}/containers`);
    for (const c of container) {
      lignes.push(`- ${c.publicId ?? '?'} « ${c.name ?? '?'} » — compte « ${a.name ?? a.accountId} »${c.domainName?.length ? `, ${c.domainName.join(', ')}` : ''}`);
    }
  }
  return lignes;
};

/**
 * Le conteneur de `GTM_CONTENEUR`. Vide : refus, avec les conteneurs visibles
 * pour le choisir — rien d'autre ne se lit tant qu'il n'est pas posé.
 */
export const conteneurGtm = async (env: Env): Promise<Conteneur> => {
  const publicId = (env.GTM_CONTENEUR ?? '').trim();
  if (!publicId) {
    const visibles = await conteneursVisibles(env);
    throw new Refus([
      'GTM_CONTENEUR est vide dans wrangler.toml : aucun conteneur n\'est lu.',
      visibles.length ? 'Conteneurs visibles par le compte du jeton :' : 'Le compte du jeton ne voit aucun conteneur.',
      ...visibles,
      'Recopier l\'identifiant voulu (GTM-…) dans GTM_CONTENEUR, puis déployer : ./scripts/deploy.sh mcp.',
    ].join('\n'), 503);
  }
  if (!FORME_CONTENEUR.test(publicId)) {
    throw new Refus(`GTM_CONTENEUR « ${publicId} » n'est pas un identifiant de conteneur (GTM-…) : Tag Manager est fermé.`, 503);
  }
  const cle = `${env.GTM_REFRESH_TOKEN ?? ''}|${publicId}`;
  const connu = resolus.get(cle);
  if (connu) return connu;

  const c = await appeler<Partial<Conteneur>>(env, `/accounts/containers:lookup?tagId=${publicId}`);
  // Le compte et l'identifiant entrent dans les chemins : chiffres seulement.
  if (!/^\d{1,20}$/.test(c.accountId ?? '') || !/^\d{1,20}$/.test(c.containerId ?? '') || c.publicId !== publicId) {
    throw new Refus(`Tag Manager ne rend pas le conteneur ${publicId} sous une forme attendue.`, 503);
  }
  const conteneur: Conteneur = {
    accountId: c.accountId!, containerId: c.containerId!, publicId,
    name: c.name, domainName: c.domainName, tagManagerUrl: c.tagManagerUrl,
  };
  resolus.set(cle, conteneur);
  return conteneur;
};

// ── Lire ─────────────────────────────────────────────────────────────────

type Version = {
  containerVersionId?: string; name?: string; tagManagerUrl?: string;
  tag?: Balise[]; trigger?: Declencheur[]; variable?: Variable[]; builtInVariable?: { name?: string }[];
};

/** La version publiée : ce que le site exécute. Une requête. */
export const versionEnLigne = async (env: Env, c: Conteneur): Promise<Contenu & { id?: string; nom?: string; lien?: string }> => {
  const v = await appeler<Version>(env, `/accounts/${c.accountId}/containers/${c.containerId}/versions:live`, c);
  return {
    source: `la version en ligne n° ${v.containerVersionId ?? '?'}${v.name ? ` « ${v.name} »` : ''}`,
    id: v.containerVersionId, nom: v.name, lien: v.tagManagerUrl,
    balises: v.tag ?? [], declencheurs: v.trigger ?? [], variables: v.variable ?? [],
    integrees: (v.builtInVariable ?? []).map((b) => b.name ?? '?'),
    tronque: false,
  };
};

/** Les espaces de travail. Une requête. */
export const espaces = async (env: Env, c: Conteneur): Promise<Espace[]> =>
  (await appeler<{ workspace?: Espace[] }>(env, `/accounts/${c.accountId}/containers/${c.containerId}/workspaces`, c)).workspace ?? [];

/** Ce qu'un espace de travail change par rapport à la version sur laquelle il repose. Une requête. */
export const modifications = async (env: Env, c: Conteneur, espace: string): Promise<Modification[]> =>
  (await appeler<{ workspaceChange?: Modification[] }>(env, `/accounts/${c.accountId}/containers/${c.containerId}/workspaces/${espace}/status`, c))
    .workspaceChange ?? [];

/**
 * Le contenu d'un espace de travail : ce qui serait publié. Quatre listes,
 * MAX_PAGES pages chacune au plus. L'espace doit exister : `espaces` le dit.
 */
export const contenuEspace = async (env: Env, c: Conteneur, espace: Espace): Promise<Contenu> => {
  const base = `/accounts/${c.accountId}/containers/${c.containerId}/workspaces/${espace.workspaceId}`;
  const [balises, declencheurs, variables, integrees] = await Promise.all([
    lister<Balise>(env, `${base}/tags`, 'tag', c),
    lister<Declencheur>(env, `${base}/triggers`, 'trigger', c),
    lister<Variable>(env, `${base}/variables`, 'variable', c),
    lister<{ name?: string }>(env, `${base}/built_in_variables`, 'builtInVariable', c),
  ]);
  return {
    source: `l'espace de travail « ${espace.name ?? '?'} » (${espace.workspaceId})`,
    balises: balises.elements, declencheurs: declencheurs.elements, variables: variables.elements,
    integrees: integrees.elements.map((b) => b.name ?? '?'),
    tronque: balises.tronque || declencheurs.tronque || variables.tronque || integrees.tronque,
  };
};

/** Une balise d'un espace de travail, par son numéro, avec son empreinte. Une requête. */
export const baliseEspace = (env: Env, c: Conteneur, espace: string, balise: string): Promise<Balise> =>
  appeler<Balise>(env, `/accounts/${c.accountId}/containers/${c.containerId}/workspaces/${espace}/tags/${balise}`, c);

// ── Écrire (décision du 09/10/2026) ──────────────────────────────────────

export type EntiteGtm = 'espace' | 'declencheur' | 'balise';

/**
 * G8 — les trois chemins où le serveur écrit : créer un espace de travail dans
 * le conteneur, et créer un déclencheur ou une balise dans l'espace
 * « [Claude] ». `espace` est celui que Tag Manager a rendu : son nom ET son
 * identifiant sont vérifiés ici. Ni PUT, ni DELETE, ni `:publish`,
 * `:create_version`, `:quick_preview`, `:sync` — rien d'autre. Exporté pour
 * le test qui la vérifie.
 */
export const cheminEcriturePermis = (chemin: string, c: Conteneur, espace?: Espace): boolean => {
  if (!/^\d{1,20}$/.test(c.accountId) || !/^\d{1,20}$/.test(c.containerId)) return false;
  const base = `/accounts/${c.accountId}/containers/${c.containerId}/workspaces`;
  if (chemin === base) return true;
  if (espace?.name !== ESPACE_CLAUDE || !/^\d{1,20}$/.test(espace.workspaceId ?? '')) return false;
  return chemin === `${base}/${espace.workspaceId}/triggers` || chemin === `${base}/${espace.workspaceId}/tags`;
};

/**
 * G9 — les seules formes créées. Des balises de conversion Google Ads et
 * d'événement GA4, avec leurs seuls paramètres : jamais de HTML, d'image, de
 * JavaScript ni de modèle personnalisés — ce serait du code exécuté sur le
 * site. Des déclencheurs de vue de page, d'événement personnalisé et de clic :
 * les trois formes que le conteneur emploie.
 */
const BALISES_PERMISES: Record<string, string[]> = {
  awct: ['conversionId', 'conversionLabel', 'conversionValue', 'enableConversionLinker', 'conversionCookiePrefix',
    'enableEnhancedConversion', 'cssProvidedEnhancedConversionValue', 'rdp'],
  gaawe: ['eventName', 'measurementIdOverride', 'sendEcommerceData', 'eventSettingsTable'],
};
const DECLENCHEURS_PERMIS = ['pageview', 'customEvent', 'click'];
const OPERATEURS_PERMIS = ['equals', 'contains', 'startsWith', 'endsWith', 'matchRegex', 'cssSelector'];
const VARIABLE = /^\{\{[^{}<>]{1,100}\}\}$/;
const MAX_CONDITIONS = 6;
const MAX_DECLENCHEURS = 5;

const seulement = (o: object, cles: string[]) => Object.keys(o).filter((k) => !cles.includes(k));

/** Une valeur : du texte court, sans balisage. Une référence de variable y reste permise. */
const valeurRefusee = (v: unknown): string | null =>
  typeof v !== 'string' || v.length > 1000 ? 'valeur absente ou trop longue' : /[<]/.test(v) ? `« < » dans la valeur « ${v.slice(0, 60)} »` : null;

const conditionRefusee = (x: unknown): string | null => {
  const c = (x ?? {}) as Condition & Record<string, unknown>;
  if (seulement(c, ['type', 'parameter']).length) return 'champ de condition hors de la table';
  if (!OPERATEURS_PERMIS.includes(c.type ?? '')) return `opérateur ${c.type} hors de la table`;
  const ps = c.parameter ?? [];
  if (!Array.isArray(ps) || new Set(ps.map((p) => p.key)).size !== ps.length) return 'paramètres de condition en double';
  for (const p of ps) {
    if (seulement(p, ['type', 'key', 'value']).length) return 'paramètre de condition hors de la table';
    if (p.key === 'negate' || p.key === 'ignore_case') {
      if (p.type !== 'boolean' || !['true', 'false'].includes(p.value ?? '')) return `${p.key} : un booléen`;
    } else if (p.key === 'arg0' || p.key === 'arg1') {
      if (p.type !== 'template') return `${p.key} : un texte`;
      const refus = valeurRefusee(p.value);
      if (refus) return refus;
    } else return `paramètre de condition ${p.key} hors de la table`;
  }
  // Tag Manager l'exige : à gauche, une variable.
  if (!VARIABLE.test(ps.find((p) => p.key === 'arg0')?.value ?? '')) return 'à gauche d\'une condition, une variable {{…}}';
  if (ps.find((p) => p.key === 'arg1')?.value === undefined) return 'condition sans valeur';
  return null;
};

const parametreRefuse = (p: Parametre, permis: string[]): string | null => {
  if (!permis.includes(p.key ?? '')) return `paramètre ${p.key} hors de la table`;
  if (p.key === 'eventSettingsTable') {
    if (p.type !== 'list' || !Array.isArray(p.list) || p.list.length > 25 || seulement(p, ['type', 'key', 'list']).length) return 'eventSettingsTable : une liste';
    for (const ligne of p.list) {
      if (ligne.type !== 'map' || !Array.isArray(ligne.map) || seulement(ligne, ['type', 'map']).length) return 'eventSettingsTable : des lignes';
      const cles = ligne.map.map((m) => m.key).sort().join(',');
      if (cles !== 'parameter,parameterValue') return 'eventSettingsTable : parameter et parameterValue';
      for (const m of ligne.map) {
        if (m.type !== 'template' || seulement(m, ['type', 'key', 'value']).length) return 'eventSettingsTable : du texte';
        const refus = valeurRefusee(m.value);
        if (refus) return refus;
      }
    }
    return null;
  }
  if (seulement(p, ['type', 'key', 'value']).length) return `paramètre ${p.key} : une valeur simple`;
  if (p.type === 'boolean') return ['true', 'false'].includes(p.value ?? '') ? null : `${p.key} : un booléen`;
  if (p.type !== 'template') return `${p.key} : un texte`;
  return valeurRefusee(p.value);
};

/**
 * La table fermée des corps, vérifiée juste avant l'envoi (`creerGtm`) — et à
 * l'aperçu. Rend la raison d'un refus, ou null. Exportée pour le test.
 */
export const formeRefusee = (entite: EntiteGtm, corps: unknown): string | null => {
  if (!corps || typeof corps !== 'object' || Array.isArray(corps)) return 'corps absent';
  const o = corps as Record<string, unknown>;
  if (entite === 'espace') {
    return o.name === ESPACE_CLAUDE && typeof o.description === 'string' && o.description.length <= 500 && !seulement(o, ['name', 'description']).length
      ? null : `un espace de travail se nomme « ${ESPACE_CLAUDE} », et n'a pas d'autre champ que sa description`;
  }
  if (typeof o.name !== 'string' || !o.name.startsWith(`${ESPACE_CLAUDE} `) || o.name.length > 200 || /[<]/.test(o.name)) {
    return `le nom commence par « ${ESPACE_CLAUDE} »`;
  }
  if (o.notes !== undefined && (typeof o.notes !== 'string' || o.notes.length > 500)) return 'notes : un texte court';

  if (entite === 'declencheur') {
    const hors = seulement(o, ['name', 'type', 'filter', 'customEventFilter', 'notes']);
    if (hors.length) return `champ de déclencheur hors de la table : ${hors.join(', ')}`;
    if (!DECLENCHEURS_PERMIS.includes(String(o.type))) return `type de déclencheur ${String(o.type)} hors de la table`;
    const filtre = (o.filter ?? []) as unknown[];
    const evenement = (o.customEventFilter ?? []) as unknown[];
    if (!Array.isArray(filtre) || !Array.isArray(evenement)) return 'conditions : des listes';
    if (o.type === 'customEvent') {
      const c = evenement[0] as Condition | undefined;
      if (evenement.length !== 1 || c?.type !== 'equals' || c.parameter?.find((p) => p.key === 'arg0')?.value !== '{{_event}}') {
        return 'un événement personnalisé se reconnaît à son nom : {{_event}} égale …';
      }
    } else if (evenement.length) return 'customEventFilter : réservé à l\'événement personnalisé';
    // Sans condition, la balise partirait à chaque page ou à chaque clic.
    if (filtre.length + evenement.length === 0) return 'un déclencheur sans condition';
    if (filtre.length + evenement.length > MAX_CONDITIONS) return `plus de ${MAX_CONDITIONS} conditions`;
    for (const c of [...filtre, ...evenement]) {
      const refus = conditionRefusee(c);
      if (refus) return refus;
    }
    return null;
  }

  const hors = seulement(o, ['name', 'type', 'parameter', 'firingTriggerId', 'consentSettings', 'notes']);
  if (hors.length) return `champ de balise hors de la table : ${hors.join(', ')}`;
  const permis = BALISES_PERMISES[String(o.type)];
  if (!permis) return `type de balise ${String(o.type)} hors de la table — jamais de HTML, d'image, de JavaScript ni de modèle personnalisés`;
  const ps = o.parameter as Parametre[];
  if (!Array.isArray(ps) || new Set(ps.map((p) => p.key)).size !== ps.length) return 'paramètres : une liste, sans doublon';
  for (const p of ps) {
    const refus = parametreRefuse(p, permis);
    if (refus) return refus;
  }
  const valeurDe = (cle: string) => ps.find((p) => p.key === cle)?.value ?? '';
  if (o.type === 'awct' && (!/^\d{1,20}$/.test(valeurDe('conversionId')) || !/^[A-Za-z0-9_-]{1,100}$/.test(valeurDe('conversionLabel')))) {
    return 'une conversion porte son identifiant (chiffres) et son libellé';
  }
  if (o.type === 'gaawe' && (!/^G-[A-Z0-9]{4,20}$/.test(valeurDe('measurementIdOverride')) || !valeurDe('eventName'))) {
    return 'un événement GA4 porte son nom et l\'identifiant de mesure G-…';
  }
  const ids = o.firingTriggerId as unknown[];
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_DECLENCHEURS || !ids.every((x) => typeof x === 'string' && /^\d{1,20}$/.test(x))) {
    return `de 1 à ${MAX_DECLENCHEURS} déclencheurs, par identifiant`;
  }
  if (o.consentSettings !== undefined && JSON.stringify(o.consentSettings) !== JSON.stringify({ consentStatus: 'notNeeded' })) {
    return 'consentement : « aucun consentement supplémentaire », comme les balises Google du conteneur';
  }
  return null;
};

/**
 * La seule écriture de la couche D : créer l'espace « [Claude] », ou, dans
 * cet espace, un déclencheur ou une balise. Un POST, avec le jeton
 * d'écriture, sur un chemin de `cheminEcriturePermis`, d'un corps que
 * `formeRefusee` accepte — vérifiés ICI, quel que soit l'appelant.
 */
export const creerGtm = async <T>(env: Env, c: Conteneur, entite: EntiteGtm, corps: unknown, espace?: Espace): Promise<T> => {
  const base = `/accounts/${c.accountId}/containers/${c.containerId}/workspaces`;
  const chemin = entite === 'espace' ? base : `${base}/${espace?.workspaceId}/${entite === 'balise' ? 'tags' : 'triggers'}`;
  if (!cheminEcriturePermis(chemin, c, entite === 'espace' ? undefined : espace)) throw new Error(`Écriture refusée par la couche D : ${chemin}`);
  const refus = formeRefusee(entite, corps);
  if (refus) throw new Error(`Écriture refusée par la table fermée de Tag Manager : ${refus}`);
  return envoyer<T>(env, ECRIRE, 'POST', chemin, corps);
};

// ── Modifier (décision du 11/10/2026) ────────────────────────────────────

/**
 * Les trois modifications permises d'une balise existante, et elles seules :
 * la mettre en pause, lui ajouter des déclencheurs, couper son envoi de page
 * vue. Ni rétablir, ni retirer, ni renommer, ni toucher au code.
 */
export type NatureModification = 'pause' | 'declencheurs' | 'pages_vues';

/**
 * G15 — ce qui se met en pause : des balises de mesure. Jamais la balise
 * Google (googtag), qui porte la configuration de Google Ads ou de GA4 ; ni le
 * linker (gclidw), qui garde le clic d'origine des conversions ; ni du HTML,
 * une image ou un modèle personnalisés : le mode Consentement du conteneur est
 * un modèle (cvt_K8GSG), et un bandeau de consentement s'y cache souvent. Une
 * pause là ferait partir le reste sans consentement réglé.
 */
export const TYPES_PAUSE = ['awct', 'awcc', 'sp', 'gaawe', 'gaawc', 'ua', 'flc', 'fls'];

/** G15 — ce qui reçoit un déclencheur : les types que ce serveur crée. Étendre une balise de code, c'est exécuter ce code ailleurs. */
export const TYPES_AJOUT = ['awct', 'gaawe'];

/** Les déclencheurs d'initialisation : ceux de la configuration et du consentement, jamais ajoutés. */
const INITIALISATION = ['2147479572', '2147479573'];
const MAX_AJOUTS = 5;

/** Ce que Tag Manager tient à jour lui-même : ni renvoyé, ni comparé. */
const VOLATILS = ['path', 'accountId', 'containerId', 'workspaceId', 'tagId', 'fingerprint', 'tagManagerUrl'];

/** Une balise telle qu'elle se renvoie dans un PUT : sans ce que Tag Manager tient à jour lui-même. */
export const normaliserBalise = (b: Balise): Record<string, unknown> =>
  Object.fromEntries(Object.entries(b).filter(([k]) => !VOLATILS.includes(k)));

/** Une chaîne qui ne dépend pas de l'ordre des clés : la même balise, relue, donne la même. */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));

const sans = (o: Record<string, unknown>, cles: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !cles.includes(k)));

/**
 * G17 — la trace : une ligne « [Claude] … » ajoutée aux notes de la balise. Le
 * nom ne change pas — c'est celui de Florent ; les notes se lisent dans Tag
 * Manager, à côté de la modification.
 */
export const noter = (notes: unknown, ligne: string): string => (typeof notes === 'string' && notes ? `${notes}\n${ligne}` : ligne);

const notesRefusees = (avant: unknown, apres: unknown): string | null => {
  const prefixe = typeof avant === 'string' && avant ? `${avant}\n` : '';
  if (typeof apres !== 'string' || !apres.startsWith(prefixe)) return 'notes : celles de la balise restent, une ligne s\'y ajoute';
  const ligne = apres.slice(prefixe.length);
  return ligne.startsWith(`${MARQUE} `) && ligne.length <= 400 && !/[\n\r<]/.test(ligne)
    ? null : `notes : une ligne « ${MARQUE} … », courte, sans balisage`;
};

// La balise Google : send_page_view, dans sa table de configuration.
const ENVOI_PAGES = 'send_page_view';
const lignesConfig = (ps: Parametre[] | undefined) => ps?.find((p) => p.key === 'configSettingsTable')?.list ?? [];
const estEnvoiPages = (l: Parametre) => Boolean(l.map?.some((m) => m.key === 'parameter' && m.value === ENVOI_PAGES));

/**
 * Une balise Google envoie-t-elle une page vue à chaque chargement ? « oui »
 * par défaut, sauf `send_page_view` à false ; « inconnu » quand la valeur
 * passe par une variable, qui ne se lit qu'au chargement de la page.
 */
export const pagesVues = (b: Balise): 'oui' | 'non' | 'inconnu' => {
  const ligne = lignesConfig(b.parameter).find(estEnvoiPages);
  if (ligne) {
    const v = ligne.map?.find((m) => m.key === 'parameterValue')?.value?.trim().toLowerCase();
    return v === 'false' ? 'non' : v === 'true' ? 'oui' : 'inconnu';
  }
  return b.parameter?.some((p) => p.key === 'configSettingsVariable') ? 'inconnu' : 'oui';
};

/** G16 — les paramètres d'une balise Google, send_page_view à false. Rien d'autre ne change, l'ordre non plus. */
export const couperPagesVues = (ps: Parametre[]): Parametre[] => {
  const ligne: Parametre = { type: 'map', map: [{ type: 'template', key: 'parameter', value: ENVOI_PAGES }, { type: 'template', key: 'parameterValue', value: 'false' }] };
  const table = ps.find((p) => p.key === 'configSettingsTable');
  if (!table) return [...ps, { type: 'list', key: 'configSettingsTable', list: [ligne] }];
  const lignes = table.list ?? [];
  const i = lignes.findIndex(estEnvoiPages);
  const nouvelles = i < 0 ? [...lignes, ligne]
    : lignes.map((l, j) => (j === i ? { ...l, map: (l.map ?? []).map((m) => (m.key === 'parameterValue' ? { ...m, value: 'false' } : m)) } : l));
  return ps.map((p) => (p === table ? { ...table, list: nouvelles } : p));
};

const CHAMP_MODIFIE: Record<NatureModification, string> = { pause: 'paused', declencheurs: 'firingTriggerId', pages_vues: 'parameter' };

/**
 * G14 — la table fermée des différences. `stockee` : la balise telle que Tag
 * Manager la tient ; `apres` : le corps qui partirait. Il n'en diffère que du
 * champ de la nature demandée, dans le seul sens permis, et d'une ligne
 * « [Claude] … » ajoutée aux notes. Jouée à l'aperçu, et rejouée par
 * `modifierBaliseGtm` contre la balise relue au moment d'écrire. Rend la
 * raison d'un refus, ou null. Exportée pour le test.
 */
export const modificationRefusee = (nature: NatureModification, stockee: Balise, apres: unknown): string | null => {
  if (!apres || typeof apres !== 'object' || Array.isArray(apres)) return 'corps absent';
  const a = apres as Record<string, unknown>;
  const avant = normaliserBalise(stockee);
  const tenus = Object.keys(a).filter((k) => VOLATILS.includes(k));
  if (tenus.length) return `champ tenu par Tag Manager dans le corps : ${tenus.join(', ')}`;
  const champ = CHAMP_MODIFIE[nature];
  if (canon(sans(avant, [champ, 'notes'])) !== canon(sans(a, [champ, 'notes']))) {
    return `la modification change autre chose que ${champ} et les notes`;
  }
  const notes = notesRefusees(avant.notes, a.notes);
  if (notes) return notes;
  const type = String(avant.type);

  if (nature === 'pause') {
    if (!TYPES_PAUSE.includes(type)) return `une balise ${type} ne se met pas en pause par ce serveur`;
    if (avant.paused === true) return 'la balise est déjà en pause';
    // Une pause, jamais l'inverse : rétablir une balise se fait dans Tag Manager.
    return a.paused === true ? null : 'une pause met paused à true';
  }

  if (nature === 'declencheurs') {
    if (!TYPES_AJOUT.includes(type)) return `une balise ${type} ne reçoit pas de déclencheur par ce serveur`;
    const ids = (avant.firingTriggerId ?? []) as string[];
    const nouveaux = a.firingTriggerId;
    if (!Array.isArray(nouveaux) || canon(nouveaux.slice(0, ids.length)) !== canon(ids)) {
      return 'les déclencheurs de la balise restent, dans leur ordre : on en ajoute, on n\'en retire pas';
    }
    const ajout = nouveaux.slice(ids.length);
    if (ajout.length === 0 || ajout.length > MAX_AJOUTS) return `de 1 à ${MAX_AJOUTS} déclencheurs ajoutés`;
    if (!ajout.every((x) => typeof x === 'string' && /^\d{1,20}$/.test(x))) return 'des déclencheurs, par identifiant';
    if (new Set(nouveaux).size !== nouveaux.length) return 'un déclencheur en double';
    if (ajout.some((x) => INITIALISATION.includes(x as string))) return 'un déclencheur d\'initialisation';
    if (ajout.some((x) => ((avant.blockingTriggerId ?? []) as string[]).includes(x as string))) return 'un déclencheur qui bloque la balise';
    return null;
  }

  if (type !== 'googtag') return 'send_page_view n\'existe que dans une balise Google (googtag)';
  if (pagesVues(stockee) !== 'oui') return 'la balise n\'envoie pas de page vue certaine : rien à couper';
  return canon(a.parameter) === canon(couperPagesVues((avant.parameter ?? []) as Parametre[]))
    ? null : 'send_page_view passe à false, et rien d\'autre ne change dans les paramètres';
};

/**
 * G13 — le seul chemin où le serveur modifie : une balise de l'espace
 * « [Claude] », avec l'empreinte de la version qu'il vient de relire. Ni un
 * déclencheur, ni une variable, ni un autre espace. Exporté pour le test.
 */
export const cheminModificationPermis = (chemin: string, c: Conteneur, espace?: Espace): boolean => {
  if (!/^\d{1,20}$/.test(c.accountId) || !/^\d{1,20}$/.test(c.containerId)) return false;
  if (espace?.name !== ESPACE_CLAUDE || !/^\d{1,20}$/.test(espace.workspaceId ?? '')) return false;
  const base = `/accounts/${c.accountId}/containers/${c.containerId}/workspaces/${espace.workspaceId}/tags/`;
  return chemin.startsWith(base) && /^\d{1,20}\?fingerprint=[A-Za-z0-9_-]{1,64}$/.test(chemin.slice(base.length));
};

/**
 * La seule modification de la couche D. Elle relit ELLE-MÊME la balise dans
 * l'espace « [Claude] », avec le jeton de lecture ; vérifie que le corps n'en
 * diffère que de ce que `modificationRefusee` permet ; puis l'envoie, avec le
 * jeton d'écriture, accompagné de l'empreinte relue : une balise changée entre
 * la relecture et l'envoi, Tag Manager la refuse. Quel que soit l'appelant.
 */
export const modifierBaliseGtm = async <T>(
  env: Env, c: Conteneur, espace: Espace, balise: string, nature: NatureModification, apres: unknown,
): Promise<T> => {
  const base = `/accounts/${c.accountId}/containers/${c.containerId}/workspaces/${espace.workspaceId}/tags/${balise}`;
  // L'espace et la balise d'abord : rien ne se lit hors de « [Claude] » pour l'écrire.
  if (!cheminModificationPermis(`${base}?fingerprint=0`, c, espace)) throw new Error(`Écriture refusée par la couche D : ${base}`);
  const stockee = await appeler<Balise>(env, base, c);
  const refus = modificationRefusee(nature, stockee, apres);
  if (refus) {
    // L'aperçu a joué la même table : un écart ici veut dire que la balise a
    // changé depuis — dans l'espace, ou dans la copie que Tag Manager vient d'ouvrir.
    throw new Refus(`La balise n° ${balise} de l'espace « ${ESPACE_CLAUDE} » n'est plus celle de l'aperçu (${refus}) : rien n'est parti. ` +
      'Refaites un aperçu.', 409);
  }
  const chemin = `${base}?fingerprint=${stockee.fingerprint ?? ''}`;
  if (!cheminModificationPermis(chemin, c, espace)) throw new Error(`Écriture refusée par la couche D : ${chemin}`);
  return envoyer<T>(env, ECRIRE, 'PUT', chemin, apres);
};
