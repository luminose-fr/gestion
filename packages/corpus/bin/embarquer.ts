#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { charger, empreintes } from '../src/charger.ts';

/**
 * Écrit le corpus sous forme de module TypeScript, pour que le Worker
 * l'embarque à son déploiement.
 *
 * **Le fichier produit est gitignoré et n'est jamais édité à la main.** Il
 * n'existe que parce qu'un Worker ne peut pas lire un disque : `charger()`
 * utilise `node:fs` et ne tourne que dans Node. Le composeur, lui, est le même
 * des deux côtés — c'est ce qui garantit qu'un hash affiché dans la console est
 * exactement celui du texte copié.
 *
 * Conséquence assumée : **le déploiement EST la synchronisation.** Le corpus
 * servi est celui du dernier déploiement, et l'application ne peut pas l'écrire
 * — ce n'est pas une discipline, c'est une propriété.
 */
const cible = resolve(
  process.argv[2] ?? 'workers/api/src/genere/corpus.ts',
);
const docs = charger();
const sceau = empreintes();

const contenu = `// Généré par \`npm run embarquer -w packages/corpus\`. Ne pas éditer.
// Source : packages/corpus/content/ — ${docs.length} documents.
import type { Document } from '@luminose/corpus';

export const DOCUMENTS: Document[] = ${JSON.stringify(docs, null, 2)};

// L'empreinte git de chaque fichier au moment de l'embarquement. Elle permet
// au Worker de dire, en un appel à l'arbre du dépôt, si ce qu'il sert est
// encore ce qui est commité — voir \`empreintes()\` dans packages/corpus.
export const EMPREINTES: Record<string, string> = ${JSON.stringify(sceau, null, 2)};
`;

mkdirSync(dirname(cible), { recursive: true });
writeFileSync(cible, contenu, 'utf8');
console.error(`${docs.length} documents embarqués → ${cible}`);
