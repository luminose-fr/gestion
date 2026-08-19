/**
 * Les alias de colonnes du code résolvent-ils le schéma RÉEL de Notion ?
 *
 * Ce test existe parce que deux champs du catalogue de modèles étaient morts
 * en silence depuis toujours : le code cherchait « Cas d'usage » et
 * « Qualité Rédaction » quand les colonnes s'appellent « Meilleurs cas
 * d'utilisation » et « Qualité pour le texte ». L'introspection de schéma les
 * ignorait proprement avec un warning — donc rien ne cassait, et personne ne
 * voyait que deux champs n'étaient jamais enregistrés.
 *
 * Il s'appuie sur l'export de la phase 0 (SPEC §9.4), qui contient le schéma
 * tel que Notion le déclare. Il devient caduc après la bascule vers D1, où les
 * colonnes sont définies par une migration SQL — c'est le but.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = join(import.meta.dirname, '..', '..', '..', 'fixtures');

const latestExport = () => {
  const files = readdirSync(FIXTURES).filter(f => /^notion-export-.*\.json$/.test(f)).sort();
  return files.length ? JSON.parse(readFileSync(join(FIXTURES, files[files.length - 1]), 'utf8')) : null;
};

/** Même normalisation que notionService : accents, apostrophes, casse, ponctuation. */
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Alias déclarés dans MODEL_FIELDS — dupliqués ici volontairement : le test
 *  doit échouer si le code change sans que le schéma suive, et inversement. */
const MODEL_ALIASES: Record<string, string[]> = {
  name: ['Nom'],
  apiCode: ['Code API'],
  provider: ['Fournisseur'],
  cost: ['Cout', 'Coût'],
  strengths: ['Forces'],
  bestUseCases: ["Meilleurs cas d'utilisation", "Cas d'usage"],
  textQuality: ['Qualité pour le texte', 'Qualité Rédaction'],
  isDefault: ['Défaut'],
};

const CONTENT_COLUMNS = [
  'Titre', 'Statut', 'Plateforme', 'Contenu', 'Date de publication', 'Notes',
  'Analysé', 'Verdict', 'Angle stratégique', 'Format cible', 'Objectif',
  'Justification', 'Métaphore Suggérée', 'Profondeur', 'Coach Session',
  'Slides', 'Post Court', 'Script vidéo',
];

const data = latestExport();

describe.skipIf(!data)('schéma Notion réel (export phase 0)', () => {
  it('chaque champ de modèle résout une colonne existante', () => {
    const real = new Set(Object.keys(data.databases.models.schema).map(norm));
    const dead = Object.entries(MODEL_ALIASES)
      .filter(([, aliases]) => !aliases.some(a => real.has(norm(a))))
      .map(([field]) => field);
    expect(dead).toEqual([]);
  });

  it('chaque colonne du schéma modèles est atteinte par un alias', () => {
    const claimed = new Set(Object.values(MODEL_ALIASES).flat().map(norm));
    const orphans = Object.keys(data.databases.models.schema).filter(c => !claimed.has(norm(c)));
    expect(orphans).toEqual([]);
  });

  it('chaque colonne de contenu attendue existe dans Notion', () => {
    const real = new Set(Object.keys(data.databases.content.schema).map(norm));
    const missing = CONTENT_COLUMNS.filter(c => !real.has(norm(c)));
    expect(missing).toEqual([]);
  });
});
