#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
/**
 * Les règles de voix, extraites de leur fiche.
 *
 * POURQUOI CETTE MOITIÉ EXISTE. Les règles de voix vivaient dans
 * `packages/editorial/src/voice.ts`, écrites à la main. Le corpus s'abstenait
 * de les recopier — discipline correcte — mais avec une conséquence que
 * personne ne voyait : le profil `complet`, celui qu'on colle chez ChatGPT et
 * Gemini, contient le bloc `voix/`… qui ne portait que la direction
 * artistique. **Ces deux outils recevaient le positionnement, les offres, les
 * canaux, et rien sur la façon d'écrire.**
 *
 * La fiche devient donc la source, et `voice.ts` sa copie engendrée. Les
 * prompts ne changent pas d'un octet — c'est la condition, et les dix-neuf
 * fixtures golden en sont la preuve : si ce générateur déforme le texte, elles
 * bougent toutes.
 *
 * L'extraction suit une règle qu'on peut vérifier à l'œil : le préambule est
 * fait de titres et de citations, les règles commencent à la première ligne
 * ordinaire.
 */
const REGLES = 'voix/regles-de-voix';

const reglesDeVoix = (docs: ReturnType<typeof charger>): string => {
  const doc = docs.find((d) => d.chemin === REGLES);
  if (!doc) throw new Error(`Fiche ${REGLES}.md introuvable : voice.ts ne peut pas être engendré.`);

  const lignes = doc.corps.split('\n');
  const debut = lignes.findIndex((l) => l.trim() !== '' && !l.startsWith('#') && !l.startsWith('>'));
  if (debut < 0) throw new Error(`${REGLES}.md ne contient que du préambule.`);

  const texte = lignes.slice(debut).join('\n').trim();
  if (!texte) throw new Error(`${REGLES}.md ne donne aucune règle.`);
  return texte;
};

/** Échappe ce qui casserait le littéral de gabarit qu'on écrit. */
const pourGabarit = (texte: string) =>
  texte.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const cible = resolve(
  process.argv[2] ?? 'workers/api/src/genere/corpus.ts',
);
const docs = charger();
const sceau = empreintes();
const voix = reglesDeVoix(docs);

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

// La seconde sortie : les règles de voix, là où @luminose/editorial les lit.
// Repérée depuis CE fichier, pas depuis le dossier courant : la commande se
// lance tantôt à la racine, tantôt dans le workspace.
const cibleVoix = fileURLToPath(new URL('../../editorial/src/voice.ts', import.meta.url));
writeFileSync(cibleVoix, `// Généré par \`npm run embarquer -w packages/corpus\`. Ne pas éditer.
// Source : packages/corpus/content/${REGLES}.md — c'est là qu'on corrige.
//
// Ce fichier est la copie de travail des règles de voix, pour que
// @luminose/editorial reste sans dépendance : il lit une constante, pas un
// disque. La fiche, elle, part aussi dans les paquets collés chez ChatGPT et
// Gemini — une seule source, deux chemins de distribution.

export const VOICE_RULES = \`
${pourGabarit(voix)}
\`.trim();
`, 'utf8');
console.error(`règles de voix embarquées → ${cibleVoix}`);
