/**
 * `packages/pratique` n'a aucune dépendance et ne lit pas l'horloge (SPEC §14.3,
 * §14.7.1). La seconde règle est ce qui rend les créneaux testables : une
 * fonction qui lirait l'heure en douce donnerait un résultat différent selon le
 * moment où l'on lance les tests, et ses bornes ne seraient jamais vérifiées.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = join(import.meta.dirname, '..');
const SOURCES = readdirSync(join(RACINE, 'src')).filter((f) => f.endsWith('.ts')).map((f) => join(RACINE, 'src', f));

describe('packages/pratique', () => {
  it('ne déclare aucune dépendance runtime', () => {
    const manifeste = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8'));
    expect(manifeste.dependencies ?? {}).toEqual({});
  });

  it('n’importe rien d’extérieur dans ses sources', () => {
    const fautes = SOURCES.flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/^\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/gm)]
        .map((m) => m[1]).filter((spec) => !spec.startsWith('.')).map((spec) => `${f} → ${spec}`));
    expect(fautes).toEqual([]);
  });

  it('ne lit jamais l’horloge : ni Date.now(), ni new Date() sans argument', () => {
    const horloge = /\bDate\.now\s*\(|\bnew\s+Date\s*\(\s*\)|\bperformance\.now\s*\(/;
    expect(SOURCES.filter((f) => horloge.test(readFileSync(f, 'utf8')))).toEqual([]);
  });
});
