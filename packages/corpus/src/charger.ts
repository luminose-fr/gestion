import { readdirSync, readFileSync } from 'node:fs';
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
  const base =
    racine ??
    join(fileURLToPath(new URL('../content', import.meta.url)));

  const docs: Document[] = [];
  for (const fichier of parcourir(base)) {
    if (!fichier.endsWith('.md')) continue;
    const rel = relative(base, fichier).split(sep).join('/');
    // Les README sont des notes de travail pour Florent, pas du contexte pour une IA.
    if (rel.endsWith('README.md')) continue;

    const { meta, corps } = separerFrontmatter(readFileSync(fichier, 'utf8'));
    const chemin = rel.replace(/\.md$/, '');
    docs.push({ chemin, bloc: chemin.split('/')[0], meta, corps });
  }
  return docs.sort((a, b) => a.chemin.localeCompare(b.chemin, 'fr'));
}

function* parcourir(dossier: string): Generator<string> {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const p = join(dossier, e.name);
    if (e.isDirectory()) yield* parcourir(p);
    else yield p;
  }
}
