/**
 * L'accès au dépôt, depuis le Worker.
 *
 * POURQUOI CE MODULE EXISTE — et pourquoi il ne casse pas l'invariant.
 *
 * Le corpus est une constante du bundle : l'application ne peut PAS écrire ce
 * qu'elle sert, et c'est une propriété, pas une discipline. Ce module ne
 * touche pas à ça. Il écrit dans **Git**, qui reste la copie unique et
 * modifiable — versionnée, avec son historique. L'application devient un
 * client de Git, pas un second entrepôt. « Deux copies modifiables » resterait
 * le problème ; une copie modifiable et un instantané servi n'en est pas un.
 *
 * Conséquence pratique, et elle compte : ce qu'on donne à éditer se lit ICI,
 * pas dans le bundle. Le bundle est la photo du dernier déploiement ; éditer
 * la photo, c'est écraser sans le voir tout commit intervenu depuis.
 *
 * LE JETON est facultatif. Absent, tout ce qui LIT le corpus continue de
 * fonctionner à l'identique — c'est la règle : une fonctionnalité en plus ne
 * doit jamais pouvoir emporter celles d'avant.
 */
import { Refus } from './refus';
import type { Env } from './env';

const DEPOT = { proprietaire: 'luminose-fr', nom: 'gestion' };
const BRANCHE = 'main';
const RACINE = 'packages/corpus/content';
const WORKFLOW = 'deploiement.yml';

/** GitHub refuse les appels sans User-Agent — et l'erreur ne le dit pas. */
const UA = 'gestion-luminose-worker';

const API = `https://api.github.com/repos/${DEPOT.proprietaire}/${DEPOT.nom}`;

export const cheminFichier = (chemin: string) => `${RACINE}/${chemin}.md`;

export const lienEdition = (chemin: string) =>
  `https://github.com/${DEPOT.proprietaire}/${DEPOT.nom}/edit/${BRANCHE}/${cheminFichier(chemin)}`;

/** Le dépôt est-il joignable en écriture ? Sert à masquer les boutons plutôt qu'à les casser. */
export const depotConfigure = (env: Env): boolean => Boolean(env.GITHUB_TOKEN);

const exigerJeton = (env: Env): string => {
  if (!env.GITHUB_TOKEN) {
    throw new Refus(
      'Aucun jeton GitHub configuré. Le corpus reste lisible ; pour le modifier depuis ici, ' +
      'posez GITHUB_TOKEN en secret Cloudflare (wrangler secret put GITHUB_TOKEN).',
      409,
    );
  }
  return env.GITHUB_TOKEN;
};

/**
 * Un appel à l'API GitHub, avec ses échecs traduits.
 *
 * Les codes de GitHub deviennent des `Refus` porteurs d'un message en clair :
 * un 401 veut dire « ton jeton est mauvais », pas « erreur interne », et c'est
 * exactement le genre de message qu'il faut lire pour agir.
 */
async function appeler(
  env: Env,
  chemin: string,
  init: RequestInit = {},
): Promise<any> {
  const jeton = exigerJeton(env);
  const res = await fetch(`${API}${chemin}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jeton}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': UA,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 204) return null;

  const texte = await res.text();
  const corps = texte ? JSON.parse(texte) : null;

  if (res.ok) return corps;

  const detail = corps?.message ?? `HTTP ${res.status}`;
  if (res.status === 401) throw new Refus(`GitHub refuse le jeton (${detail}). Vérifiez GITHUB_TOKEN.`, 409);
  if (res.status === 403) throw new Refus(`GitHub refuse l'opération (${detail}). Le jeton a-t-il les droits « Contents » et « Actions » ?`, 403);
  if (res.status === 404) throw new Refus(`Introuvable sur GitHub (${detail}).`, 404);
  if (res.status === 409 || res.status === 422) {
    throw new Refus(
      'Le fichier a changé sur GitHub depuis que vous l\'avez ouvert. ' +
      'Rechargez la fiche pour repartir de la version courante — sans quoi vous écraseriez ce commit.',
      409,
    );
  }
  throw new Error(`GitHub : ${detail}`);
}

/* ── Base64, sans dépendance ────────────────────────────────────────────
 *
 * `atob` / `btoa` ne parlent que d'octets : passer de l'UTF-8 par-dessus
 * transformerait « déontologique » en mojibake au premier accent. On encode
 * donc explicitement, dans les deux sens.
 */

const versBase64 = (texte: string): string => {
  const octets = new TextEncoder().encode(texte);
  let brut = '';
  for (const o of octets) brut += String.fromCharCode(o);
  return btoa(brut);
};

const depuisBase64 = (b64: string): string => {
  const brut = atob(b64.replace(/\n/g, ''));
  const octets = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  return new TextDecoder().decode(octets);
};

/* ── Fichiers ───────────────────────────────────────────────────────── */

export interface Source {
  chemin: string;
  contenu: string;
  /** L'empreinte du blob. À rendre au moment d'écrire : c'est elle qui détecte le conflit. */
  sha: string;
}

/** Le fichier tel qu'il est SUR GITHUB — pas tel que le bundle l'a photographié. */
export async function lireSource(env: Env, chemin: string): Promise<Source> {
  const r = await appeler(env, `/contents/${cheminFichier(chemin)}?ref=${BRANCHE}`);
  if (r?.type !== 'file' || typeof r.content !== 'string') {
    throw new Refus(`« ${chemin} » n'est pas un fichier.`, 409);
  }
  return { chemin, contenu: depuisBase64(r.content), sha: r.sha };
}

/**
 * Écrit le fichier et rend le nouveau sha.
 *
 * `sha` est celui lu à l'ouverture : GitHub rejette l'écriture s'il ne
 * correspond plus. C'est ce qui empêche deux modifications concurrentes de
 * s'écraser en silence — le même raisonnement que l'`expectedMtime` d'un
 * éditeur de fichiers.
 */
export async function ecrireSource(
  env: Env,
  chemin: string,
  contenu: string,
  sha: string,
  message: string,
): Promise<{ sha: string; commit: string }> {
  const r = await appeler(env, `/contents/${cheminFichier(chemin)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: versBase64(contenu),
      sha,
      branch: BRANCHE,
    }),
  });
  return { sha: r.content.sha, commit: r.commit.sha };
}

/* ── Déploiement ────────────────────────────────────────────────────── */

/** Lance le workflow. GitHub rend 204 sans corps : le succès est le silence. */
export async function lancerDeploiement(env: Env, cible: 'tout' | 'api' | 'app'): Promise<void> {
  await appeler(env, `/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    // Les entrées d'un workflow_dispatch voyagent en CHAÎNES par l'API, même
    // celles déclarées booléennes. `false` partirait comme un booléen JSON et
    // serait refusé.
    body: JSON.stringify({ ref: BRANCHE, inputs: { cible, repetition: 'false' } }),
  });
}

export interface EtatDeploiement {
  /** `null` = aucun déploiement n'a jamais été lancé. */
  statut: 'en_attente' | 'en_cours' | 'reussi' | 'echoue' | null;
  lance_le: number | null;
  lien: string | null;
}

const STATUT: Record<string, EtatDeploiement['statut']> = {
  queued: 'en_attente',
  requested: 'en_attente',
  pending: 'en_attente',
  waiting: 'en_attente',
  in_progress: 'en_cours',
};

export async function etatDeploiement(env: Env): Promise<EtatDeploiement> {
  const r = await appeler(env, `/actions/workflows/${WORKFLOW}/runs?per_page=1`);
  const run = r?.workflow_runs?.[0];
  if (!run) return { statut: null, lance_le: null, lien: null };

  const statut: EtatDeploiement['statut'] =
    run.status === 'completed'
      ? (run.conclusion === 'success' ? 'reussi' : 'echoue')
      : (STATUT[run.status] ?? 'en_cours');

  return {
    statut,
    lance_le: run.created_at ? Date.parse(run.created_at) : null,
    lien: run.html_url ?? null,
  };
}

/**
 * Le sha du dernier commit touchant le corpus.
 *
 * Sert à répondre « la source a-t-elle bougé depuis le dernier déploiement ? »
 * — la question que l'écran d'état pose déjà pour ChatGPT et Gemini, tournée
 * cette fois vers la maison.
 */
export async function dernierCommitCorpus(env: Env): Promise<{ sha: string; date: number | null } | null> {
  const r = await appeler(env, `/commits?sha=${BRANCHE}&path=${RACINE}&per_page=1`);
  const c = r?.[0];
  if (!c) return null;
  const d = c.commit?.committer?.date ?? c.commit?.author?.date;
  return { sha: c.sha, date: d ? Date.parse(d) : null };
}
