/**
 * Couche D — le Worker vers Google Tag Manager (décision du 08/10/2026,
 * decisions/2026-10-08-gtm.md). LECTURE SEULE : ce lot lit le conteneur du
 * site et le compare aux conversions Google Ads ; il n'écrit rien.
 *
 * Trois verrous, du plus solide au plus fragile :
 * - LE JETON (`GTM_REFRESH_TOKEN`) n'a que le scope `tagmanager.readonly` :
 *   Google refuserait toute écriture, quoi que fasse ce code. Il est à part
 *   de celui de Google Ads : absent, Tag Manager est fermé et Google Ads
 *   continue ; et l'un ne sert jamais l'autre (jeton-google.ts).
 * - `appeler` ne fait que des GET, et seulement sur les chemins de
 *   `cheminPermis` : la liste des conteneurs visibles, la recherche d'un
 *   conteneur par son identifiant public, et le contenu de CE conteneur —
 *   celui de `GTM_CONTENEUR`, dont Google donne le compte et l'identifiant.
 *   Aucune URL de l'API ne se construit ailleurs que dans ce fichier.
 * - Chaque lecture borne son nombre de requêtes : le quota de l'API Tag
 *   Manager est bas, et une page de plus n'apprendrait rien au modèle.
 */
import { jetonGoogle } from './jeton-google';
import { Refus } from './refus';
import type { Env } from './env';

const API = 'https://tagmanager.googleapis.com/tagmanager/v2';

/** Le seul scope que le jeton doit porter (scripts/jeton-google-ads.mjs gtm). */
export const SCOPE_GTM = 'https://www.googleapis.com/auth/tagmanager.readonly';

/** L'identifiant public d'un conteneur web, tel qu'il figure dans le code du site. */
export const FORME_CONTENEUR = /^GTM-[A-Z0-9]{4,12}$/;

const SCRIPT = 'node workers/mcp/scripts/jeton-google-ads.mjs gtm';

/** Au-delà, une liste s'arrête et le dit. */
const MAX_PAGES = 5;
/** La découverte des conteneurs visibles ne parcourt pas plus de comptes. */
const MAX_COMPTES = 5;

// ── Ce que l'API rend ────────────────────────────────────────────────────

export type Parametre = { type?: string; key?: string; value?: string; list?: Parametre[]; map?: Parametre[] };
export type Condition = { type?: string; parameter?: Parametre[] };
export type Balise = {
  tagId?: string; name?: string; type?: string; paused?: boolean; parameter?: Parametre[];
  firingTriggerId?: string[]; blockingTriggerId?: string[]; tagFiringOption?: string;
  consentSettings?: { consentStatus?: string; consentType?: Parametre };
  setupTag?: { tagName?: string }[]; teardownTag?: { tagName?: string }[];
};
export type Declencheur = {
  triggerId?: string; name?: string; type?: string; parameter?: Parametre[];
  filter?: Condition[]; customEventFilter?: Condition[]; autoEventFilter?: Condition[];
};
export type Variable = { variableId?: string; name?: string; type?: string; parameter?: Parametre[] };
export type Conteneur = {
  accountId: string; containerId: string; publicId: string;
  name?: string; domainName?: string[]; tagManagerUrl?: string;
};
export type Espace = { workspaceId?: string; name?: string; description?: string };
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
];

/** Un chemin que `appeler` accepte. Exporté pour le test qui le vérifie. */
export const cheminPermis = (chemin: string, c?: Conteneur): boolean => {
  if (DECOUVERTE.some((r) => r.test(chemin))) return true;
  if (!c) return false;
  const base = `/accounts/${c.accountId}/containers/${c.containerId}`;
  return chemin.startsWith(`${base}/`) && DANS_LE_CONTENEUR.some((r) => r.test(chemin.slice(base.length)));
};

// ── Appels ───────────────────────────────────────────────────────────────

const jeton = (env: Env): Promise<string> => {
  if (!env.GTM_REFRESH_TOKEN) {
    throw new Refus(
      'Secret GTM_REFRESH_TOKEN absent du Worker MCP : Tag Manager est fermé, Google Ads continue. ' +
      `Sur le Mac : ${SCRIPT}, puis depuis la VM : cd workers/mcp && npx wrangler secret put GTM_REFRESH_TOKEN ` +
      '(voir workers/mcp/README.md).',
      503,
    );
  }
  return jetonGoogle(env, env.GTM_REFRESH_TOKEN, 'GTM_REFRESH_TOKEN', SCRIPT);
};

type ErreurGoogle = { error?: { code?: number; message?: string; status?: string } };

/**
 * Un GET sur l'API Tag Manager. Les codes de Google deviennent des refus en
 * clair : un 403 veut presque toujours dire « l'API n'est pas activée » ou
 * « le jeton n'a pas le bon scope », et c'est ce qu'il faut lire pour agir.
 */
const appeler = async <T>(env: Env, chemin: string, c?: Conteneur): Promise<T> => {
  // La garde ne dépend pas de l'appelant : même un chemin assemblé de travers
  // plus haut ne sort pas d'ici.
  if (!cheminPermis(chemin, c)) throw new Error(`Chemin refusé par la couche D : ${chemin}`);
  const reponse = await fetch(API + chemin, { method: 'GET', headers: { Authorization: `Bearer ${await jeton(env)}` } });
  const texte = await reponse.text();
  if (reponse.ok) return (texte ? JSON.parse(texte) : {}) as T;

  const message = (() => { try { return (JSON.parse(texte) as ErreurGoogle).error?.message; } catch { return undefined; } })() ?? `HTTP ${reponse.status}`;
  if (reponse.status === 401) throw new Refus(`Google refuse le jeton Tag Manager (${message}). Régénérez-le : ${SCRIPT}.`, 503);
  if (reponse.status === 403) {
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(texte)) {
      throw new Refus(`L'API Tag Manager n'est pas activée dans le projet Google Cloud du client OAuth (${message}). ` +
        'L\'activer : console Google Cloud → API et services → « Tag Manager API ».', 503);
    }
    if (/insufficient authentication scopes/i.test(message)) {
      throw new Refus(`Le jeton Tag Manager n'a pas le scope ${SCOPE_GTM}. Régénérez-le : ${SCRIPT}.`, 503);
    }
    throw new Refus(`Tag Manager refuse la lecture (${message}) : le compte Google du jeton a-t-il accès à ce conteneur ?`, 403);
  }
  if (reponse.status === 404) throw new Refus(`Introuvable dans Tag Manager (${message}).`, 404);
  if (reponse.status === 429) throw new Refus(`Quota de l'API Tag Manager atteint (${message}) : réessayer dans une minute.`, 503);
  throw new Error(`Tag Manager : HTTP ${reponse.status} — ${message}`);
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
