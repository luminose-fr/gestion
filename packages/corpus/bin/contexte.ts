#!/usr/bin/env node
import { charger } from '../src/charger.ts';
import { composer } from '../src/composer.ts';
import { PROFILS } from '../src/profils.ts';
import type { Profil } from '../src/types.ts';

/**
 * Passerelle temporaire, en attendant la console de gestion.luminose.fr.
 *
 * Elle **affiche**, elle n'écrit aucun fichier : le contexte n'est jamais un
 * artefact du dépôt, il se compose à la demande. La console appellera
 * exactement le même `composer()`.
 *
 *   npm run contexte -w packages/corpus            → l'état des trois profils
 *   npm run contexte -w packages/corpus -- noyau   → le texte à copier
 */
const profils = Object.keys(PROFILS) as Profil[];
const demande = process.argv[2] as Profil | undefined;
const date = new Date().toISOString().slice(0, 10);
const docs = charger();

if (!demande) {
  console.error(`Corpus : ${docs.length} documents.\n`);
  for (const p of profils) {
    const c = composer(docs, p, date);
    const plafond = PROFILS[p].plafond;
    const alerte =
      plafond && c.taille > plafond
        ? `  ⚠ dépasse le plafond de ${plafond}`
        : '';
    console.error(
      `  ${p.padEnd(10)} ${c.hash}  ${String(c.taille).padStart(6)} car.  ` +
        `${String(c.documents.length).padStart(2)} doc.${alerte}`,
    );
  }
  console.error(`\nPour copier : npm run contexte -w packages/corpus -- <profil>`);
  process.exit(0);
}

if (!profils.includes(demande)) {
  console.error(`Profil inconnu : « ${demande} ». Attendu : ${profils.join(', ')}.`);
  process.exit(1);
}

const c = composer(docs, demande, date);
const plafond = PROFILS[demande].plafond;
if (plafond && c.taille > plafond) {
  console.error(
    `⚠ ${c.taille} caractères pour un plafond de ${plafond}. ` +
      `Retire un « noyau: true » ou raccourcis un fichier.\n`,
  );
}
// Le texte seul sur stdout : « | pbcopy » doit suffire.
process.stdout.write(c.texte);
