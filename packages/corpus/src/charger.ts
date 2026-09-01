import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { separerFrontmatter } from './frontmatter.ts';
import type { Document } from './types.ts';

/**
 * Lit `content/` depuis le disque.
 *
 * **Node uniquement.** Le composeur, lui, est pur : il ne connaît pas ce
 * module. Le Worker recevra les mêmes `Document[]` par une autre voie —
 * embarqués au déploiement (étape 05). Un seul composeur, deux chargeurs.
 */
export function charger(racine?: string): Document[] {
  const base = racine ?? racineParDefaut();

  const docs: Document[] = [];
  for (const { fichier, chemin } of fichiersDuCorpus(base)) {
    const { meta, corps } = separerFrontmatter(readFileSync(fichier, 'utf8'));
    docs.push({ chemin, bloc: chemin.split('/')[0], meta, corps });
  }
  return docs.sort((a, b) => a.chemin.localeCompare(b.chemin, 'fr'));
}

/**
 * L'empreinte git de chaque fichier du corpus, indexée par chemin.
 *
 * POURQUOI ELLE EXISTE. Le Worker sert une photo du corpus et n'a longtemps
 * eu aucun moyen de savoir si le dépôt avait bougé depuis : l'écran comparait
 * la date du dernier commit à celle du dernier run GitHub Actions — un
 * compteur aveugle à `npm run deploy`, qui est justement la voie normale. Le
 * 01/09/2026, une fiche corrigée depuis la console s'affichait encore dans son
 * ancienne version, et l'écran annonçait « aucun écart connu ».
 *
 * Ces empreintes-ci sont celles que GIT calcule, donc celles que l'API GitHub
 * rend dans un arbre. Le Worker obtient l'arbre en UN appel et compare, sans
 * télécharger une seule ligne — et il nomme les fiches qui diffèrent au lieu
 * de rendre un booléen approximatif.
 *
 * Elles voyagent À CÔTÉ des documents, jamais dedans : le hash du corpus porte
 * sur les corps, et lui faire porter autre chose ferait dériver toutes les
 * poses de ChatGPT et Gemini à la première empreinte qui bouge.
 */
export function empreintes(racine?: string): Record<string, string> {
  const base = racine ?? racineParDefaut();
  const out: Record<string, string> = {};
  for (const { fichier, chemin } of fichiersDuCorpus(base)) {
    out[chemin] = empreinteBlob(readFileSync(fichier));
  }
  return out;
}

/**
 * La formule de git : `sha1("blob <taille en octets>\0" + contenu)`.
 *
 * La taille est celle des OCTETS, pas des caractères — le corpus est plein
 * d'accents, et compter des caractères donnerait une empreinte qui ne
 * correspondrait à rien chez GitHub.
 */
const empreinteBlob = (octets: Buffer): string =>
  createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${octets.length}\0`, 'utf8'), octets]))
    .digest('hex');

const racineParDefaut = () => join(fileURLToPath(new URL('../content', import.meta.url)));

/**
 * Les fichiers qui FONT le corpus, et eux seuls.
 *
 * Ce filtre est partagé par `charger` et `empreintes` — dupliqué, il finirait
 * par diverger, et une comparaison d'empreintes qui ne porte pas exactement
 * sur les mêmes fichiers que le bundle signalerait des écarts imaginaires.
 */
function* fichiersDuCorpus(base: string): Generator<{ fichier: string; chemin: string }> {
  for (const fichier of parcourir(base)) {
    if (!fichier.endsWith('.md')) continue;
    const rel = relative(base, fichier).split(sep).join('/');
    // Les README sont des notes de travail pour Florent, pas du contexte pour une IA.
    if (rel.endsWith('README.md')) continue;
    yield { fichier, chemin: rel.replace(/\.md$/, '') };
  }
}

function* parcourir(dossier: string): Generator<string> {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const p = join(dossier, e.name);
    if (e.isDirectory()) yield* parcourir(p);
    else yield p;
  }
}
