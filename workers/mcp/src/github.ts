/**
 * Couche C — le Worker vers GitHub, pour le corpus (décision du 03/10/2026,
 * decisions/2026-10-03-corpus.md).
 *
 * Le corpus vit dans le dépôt : `packages/corpus/content/`, du markdown
 * versionné. Ce serveur le LIT tel qu'il est commité — pas la photo qu'en
 * garde la console à son dernier déploiement — et y ÉCRIT par commit, comme
 * le bouton « Modifier » de la console. Git reste la seule copie modifiable.
 *
 * TABLE FERMÉE, comme la couche B vers Google Ads : aucune URL de l'API GitHub
 * ne se construit ailleurs que dans ce fichier, et `appeler` refuse tout
 * chemin absent de CHEMINS_PERMIS. Ce que ce serveur peut écrire est décidé
 * ICI (`ecritureAdmise`, `refusDeContenu`), indépendamment des outils qui
 * préparent l'écriture : une consigne au modèle n'est pas un verrou.
 *
 * LE JETON (`GITHUB_TOKEN`) est celui de ce Worker, pas celui de la console :
 * les deux Workers ne partagent aucun secret (SPEC §1.1). Absent, les outils
 * du corpus le disent, et Google Ads continue de fonctionner.
 */
import { refusDeContenu } from '@luminose/corpus';
import { Refus } from './refus';
import type { Env } from './env';

export const DEPOT = 'luminose-fr/gestion';
export const BRANCHE = 'main';
export const RACINE = 'packages/corpus/content';
/** Le workflow « Déploiement Cloudflare » (.github/workflows/deploiement.yml) : il appelle scripts/deploy.sh. */
const WORKFLOW = 'deploiement.yml';

const API = 'https://api.github.com';
/** GitHub refuse les appels sans User-Agent — et l'erreur ne le dit pas. */
const UA = 'luminose-mcp';

/** Les six blocs du corpus (packages/corpus/README.md). Un chemin hors d'eux n'est pas du corpus. */
export const BLOCS = ['socle', 'voix', 'strategie', 'canaux', 'repertoire', 'outils'] as const;

/** Slugs sans accents ni majuscules (README du corpus) : ce qui exclut aussi les README. */
const FORME_CHEMIN = /^[a-z0-9-]+(\/[a-z0-9-]+)+$/;
const FORME_DECISION = /^strategie\/decisions\/\d{4}-\d{2}-[a-z0-9-]+$/;

const CHEMINS_PERMIS: RegExp[] = [
  /^\/graphql$/,
  /^\/repos\/luminose-fr\/gestion\/contents\/packages\/corpus\/content\/[a-z0-9-]+(\/[a-z0-9-]+)+\.md$/,
  /^\/repos\/luminose-fr\/gestion\/commits\?sha=main&path=packages\/corpus\/content&per_page=\d{1,2}$/,
  /^\/repos\/luminose-fr\/gestion\/actions\/workflows\/deploiement\.yml\/(dispatches|runs\?per_page=1)$/,
];

/**
 * Ce que le serveur peut écrire dans le dépôt — rend `null`, ou la raison du
 * refus. Vérifié par `ecrireFichier` quel que soit l'outil appelant.
 *
 * - un fichier du corpus, dans un de ses six blocs, au slug sans accents ;
 * - jamais `voix/regles-de-voix` : elle engendre les règles de voix des prompts,
 *   et la changer exige de régénérer les fixtures golden et FLUX-EDITORIAL.md
 *   (CLAUDE.md, règle 5) — un commit seul ferait échouer le déploiement ;
 * - une création n'est permise que pour une décision ;
 * - une décision ne se réécrit jamais : on en ajoute une qui la supersède.
 */
export const ecritureAdmise = (chemin: string, creation: boolean): string | null => {
  if (!FORME_CHEMIN.test(chemin)) return `« ${chemin} » n'est pas un chemin de fiche (bloc/fiche, minuscules et tirets, sans .md)`;
  if (!(BLOCS as readonly string[]).includes(chemin.split('/')[0])) return `« ${chemin.split('/')[0]} » n'est pas un bloc du corpus (${BLOCS.join(', ')})`;
  if (chemin === 'voix/regles-de-voix') {
    return 'voix/regles-de-voix engendre les règles de voix des prompts : la changer exige de régénérer les fixtures golden ' +
      'et FLUX-EDITORIAL.md, dans le dépôt (CLAUDE.md, règle 5)';
  }
  if (creation) return FORME_DECISION.test(chemin) ? null : 'seule une décision se crée (strategie/decisions/AAAA-MM-slug)';
  if (chemin.startsWith('strategie/decisions/')) return 'une décision ne se réécrit pas : on en ajoute une qui la supersède';
  return null;
};

const exigerJeton = (env: Env): string => {
  if (!env.GITHUB_TOKEN) {
    throw new Refus(
      'Secret GITHUB_TOKEN absent du Worker MCP : le corpus est fermé, Google Ads continue. Un jeton GitHub à grain fin, ' +
      'limité au dépôt luminose-fr/gestion, droits Contents et Actions en lecture-écriture — un autre que celui de la console. ' +
      'Depuis la VM : cd workers/mcp && npx wrangler secret put GITHUB_TOKEN (voir workers/mcp/README.md).',
      503,
    );
  }
  return env.GITHUB_TOKEN;
};

/**
 * Un appel à l'API GitHub. Les codes de GitHub deviennent des refus en clair :
 * un 401 veut dire « le jeton est mauvais », et c'est ce qu'il faut lire pour agir.
 * `conflit` : un 409 ou un 422 est attendu (l'écriture d'un fichier), et l'appelant le traduit.
 */
const appeler = async (
  env: Env,
  chemin: string,
  init: { methode?: 'GET' | 'POST' | 'PUT'; corps?: unknown; conflit?: boolean } = {},
): Promise<{ statut: number; corps: any }> => {
  if (!CHEMINS_PERMIS.some((permis) => permis.test(chemin))) {
    throw new Error(`Chemin refusé par la couche C : ${chemin}`);
  }
  const reponse = await fetch(API + chemin, {
    method: init.methode ?? 'GET',
    headers: {
      Authorization: `Bearer ${exigerJeton(env)}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': UA,
      ...(init.corps === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: init.corps === undefined ? undefined : JSON.stringify(init.corps),
  });
  const texte = await reponse.text();
  const corps = texte ? (() => { try { return JSON.parse(texte); } catch { return { message: texte.slice(0, 500) }; } })() : null;
  if (reponse.ok || (init.conflit && (reponse.status === 409 || reponse.status === 422))) return { statut: reponse.status, corps };

  const detail = corps?.message ?? `HTTP ${reponse.status}`;
  if (reponse.status === 401) throw new Refus(`GitHub refuse le jeton (${detail}). Vérifier le secret GITHUB_TOKEN du Worker MCP.`, 503);
  if (reponse.status === 403) throw new Refus(`GitHub refuse l'opération (${detail}). Le jeton a-t-il les droits Contents et Actions sur luminose-fr/gestion ?`, 403);
  if (reponse.status === 404) throw new Refus(`Introuvable sur GitHub (${detail}) — ou le jeton ne voit pas le dépôt.`, 404);
  throw new Error(`GitHub : HTTP ${reponse.status} — ${detail}`);
};

// ── Base64 UTF-8, sans dépendance ────────────────────────────────────────
// `btoa` ne parle que d'octets : sans ce détour, « déontologique » partirait en mojibake.

const versBase64 = (texte: string): string => {
  let brut = '';
  for (const o of new TextEncoder().encode(texte)) brut += String.fromCharCode(o);
  return btoa(brut);
};

// ── Lire ─────────────────────────────────────────────────────────────────

export type Fiche = { chemin: string; texte: string; sha: string };
export type Commit = { oid: string; date: string; titre: string };

/**
 * Le corpus entier, tel que `main` le porte, en UNE requête : le commit et le
 * texte de chaque fichier, lus dans le même instantané. Une requête par
 * fichier épuiserait les cinquante sous-requêtes d'une invocation dès que le
 * corpus dépasserait quarante fiches.
 *
 * Profondeur : bloc / sous-dossier / fichier (socle/offres/…, strategie/decisions/…)
 * — on descend d'un niveau de plus, par prudence.
 */
const BLOB = '... on Blob { oid text isBinary isTruncated }';
const ENTREES = (profondeur: number): string => profondeur === 0
  ? `entries { name type object { ${BLOB} } }`
  : `entries { name type object { ${BLOB} ... on Tree { ${ENTREES(profondeur - 1)} } } }`;
const REQUETE_CORPUS = `query { repository(owner: "luminose-fr", name: "gestion") { object(expression: "${BRANCHE}") { ... on Commit {
  oid committedDate messageHeadline
  file(path: "${RACINE}") { object { ... on Tree { ${ENTREES(3)} } } }
} } } }`;

type Entree = {
  name: string; type: string;
  object?: { oid?: string; text?: string | null; isBinary?: boolean; isTruncated?: boolean; entries?: Entree[] };
};

/**
 * Les mêmes filtres que `charger()` (packages/corpus) : des .md, jamais les
 * README. Un texte que GitHub rend tronqué ou absent fait refuser la lecture
 * entière : une modification préparée sur un texte tronqué en écraserait la fin.
 */
const aplatir = (entrees: Entree[], prefixe: string, sortie: Fiche[]) => {
  for (const e of entrees) {
    const chemin = prefixe ? `${prefixe}/${e.name}` : e.name;
    if (e.type === 'tree') aplatir(e.object?.entries ?? [], chemin, sortie);
    else if (e.type === 'blob' && e.name.endsWith('.md') && e.name !== 'README.md') {
      if (typeof e.object?.text !== 'string' || e.object.isBinary || e.object.isTruncated) {
        throw new Error(`GitHub rend ${RACINE}/${chemin} tronqué ou illisible : lecture du corpus refusée.`);
      }
      sortie.push({ chemin: chemin.replace(/\.md$/, ''), texte: e.object.text, sha: e.object.oid ?? '' });
    }
  }
};

export const lireCorpus = async (env: Env): Promise<{ commit: Commit; fiches: Fiche[] }> => {
  const { corps } = await appeler(env, '/graphql', { methode: 'POST', corps: { query: REQUETE_CORPUS } });
  if (corps?.errors?.length) throw new Error(`GitHub GraphQL : ${corps.errors.map((e: { message?: string }) => e.message).join(' ; ')}`);
  const c = corps?.data?.repository?.object;
  if (!c?.oid) throw new Refus(`La branche ${BRANCHE} de ${DEPOT} est introuvable — ou le jeton ne voit pas le dépôt.`, 404);
  const fiches: Fiche[] = [];
  aplatir(c.file?.object?.entries ?? [], '', fiches);
  return { commit: { oid: c.oid, date: c.committedDate ?? '', titre: c.messageHeadline ?? '' }, fiches };
};

export const derniersCommitsCorpus = async (env: Env, n: number): Promise<Commit[]> => {
  const { corps } = await appeler(env, `/repos/${DEPOT}/commits?sha=${BRANCHE}&path=${RACINE}&per_page=${Math.min(Math.max(1, Math.floor(n)), 20)}`);
  return (Array.isArray(corps) ? corps : []).map((c: any) => ({
    oid: String(c.sha ?? ''),
    date: String(c.commit?.committer?.date ?? c.commit?.author?.date ?? ''),
    titre: String(c.commit?.message ?? '').split('\n')[0],
  }));
};

export type Execution = { statut: string; conclusion: string | null; date: string; lien: string; commit: string };

/** Le dernier passage du workflow de déploiement, s'il y en a un. */
export const dernierDeploiement = async (env: Env): Promise<Execution | null> => {
  const { corps } = await appeler(env, `/repos/${DEPOT}/actions/workflows/${WORKFLOW}/runs?per_page=1`);
  const r = corps?.workflow_runs?.[0];
  return r ? { statut: String(r.status), conclusion: r.conclusion ?? null, date: String(r.created_at ?? ''), lien: String(r.html_url ?? ''), commit: String(r.head_sha ?? '') } : null;
};

// ── Écrire ───────────────────────────────────────────────────────────────

/**
 * La vérification à blanc d'un commit : ce que `ecrireFichier` refuserait,
 * sans rien écrire. GitHub n'a pas de `validateOnly` ; l'aperçu joue celle-ci.
 */
export const ecritureRefusee = (e: { chemin: string; contenu: string; sha: string | null }): string | null =>
  ecritureAdmise(e.chemin, e.sha === null) ?? refusDeContenu(e.contenu);

/**
 * Écrit un fichier du corpus par un commit sur `main`, et rend le commit.
 *
 * `sha` : l'empreinte du fichier lue à l'aperçu. GitHub refuse l'écriture si
 * elle ne correspond plus — un commit intervenu entre-temps n'est jamais
 * écrasé sans avoir été vu. `null` : une création, que GitHub refuse si le
 * fichier existe déjà.
 *
 * La table fermée revérifie tout ici, quel que soit l'outil : le chemin
 * (`ecritureAdmise`) et le contenu (`refusDeContenu`, la garde de la console).
 * Une violation est un défaut du code — les outils ne préparent que des
 * écritures conformes — donc on lève, et la trace part dans les journaux.
 */
export const ecrireFichier = async (
  env: Env,
  e: { chemin: string; contenu: string; sha: string | null; message: string },
): Promise<{ commit: string; lien: string }> => {
  const refus = ecritureRefusee(e);
  if (refus) throw new Error(`Écriture refusée par la table fermée (corpus) : ${refus}`);

  const { statut, corps } = await appeler(env, `/repos/${DEPOT}/contents/${RACINE}/${e.chemin}.md`, {
    methode: 'PUT',
    corps: { message: e.message, content: versBase64(e.contenu), branch: BRANCHE, ...(e.sha === null ? {} : { sha: e.sha }) },
    conflit: true,
  });
  if (statut === 409 || statut === 422) {
    throw new Refus(e.sha === null
      ? `« ${e.chemin} » existe déjà sur GitHub : rien n'a été écrit.`
      : `« ${e.chemin} » a changé sur GitHub depuis l'aperçu : rien n'a été écrit, pour ne pas écraser ce commit. Refaites un aperçu.`, 409);
  }
  const commit = String(corps?.commit?.sha ?? '');
  return { commit, lien: String(corps?.commit?.html_url ?? `https://github.com/${DEPOT}/commit/${commit}`) };
};

/**
 * Lance le workflow de déploiement, cible `api` : c'est le Worker de la
 * console qui embarque le corpus. Rien d'autre ne se lance d'ici — ni le
 * front, ni ce serveur, ni une répétition. GitHub rend 204 sans corps.
 */
export const lancerDeploiement = async (env: Env): Promise<{ lien: string }> => {
  await appeler(env, `/repos/${DEPOT}/actions/workflows/${WORKFLOW}/dispatches`, {
    methode: 'POST',
    // Les entrées d'un workflow_dispatch voyagent en CHAÎNES, même les booléennes.
    corps: { ref: BRANCHE, inputs: { cible: 'api', repetition: 'false' } },
  });
  return { lien: `https://github.com/${DEPOT}/actions/workflows/${WORKFLOW}` };
};
