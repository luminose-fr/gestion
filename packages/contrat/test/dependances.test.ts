/**
 * Garde-fou de dépendances (SPEC §14.3) : `packages/contrat` dépend de `zod`,
 * et de rien d'autre. La porte l'importera ; s'il atteignait `workers/api`, le
 * code le plus exposé du dépôt atteindrait une base ou une clé.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = join(import.meta.dirname, '..');
const SRC = join(RACINE, 'src');

describe('packages/contrat n’importe que zod', () => {
  it('son manifeste ne déclare que zod', () => {
    const manifeste = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8'));
    expect(Object.keys(manifeste.dependencies ?? {})).toEqual(['zod']);
    expect(manifeste.peerDependencies).toBeUndefined();
  });

  it('ses sources n’importent que zod et elles-mêmes', () => {
    const fichiers = readdirSync(SRC).filter((f) => f.endsWith('.ts'));
    expect(fichiers.length).toBeGreaterThan(0);
    for (const f of fichiers) {
      const source = readFileSync(join(SRC, f), 'utf8');
      const specifiers = [...source.matchAll(/\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const s of specifiers) expect(s === 'zod' || /^\.\/[a-z-]+\.ts$/.test(s), `${f} : ${s}`).toBe(true);
    }
  });
});
