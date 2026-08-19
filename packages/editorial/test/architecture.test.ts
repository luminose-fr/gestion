/**
 * SPEC §1.1 (NORMATIF) — les moteurs purs n'ont AUCUNE dépendance.
 *
 * Cette règle est ce qui rend ces packages testables sans réseau ni DOM, et
 * c'est exactement le genre de règle qui s'érode sans bruit : il suffit d'un
 * `import` pratique un jour de fatigue. Ce test la rend vérifiable.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES_DIR = join(import.meta.dirname, '..', '..');
const PURE = ['editorial', 'subtitles', 'psychedelics'];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });

/** Tout ce qui n'est ni relatif (`./`, `../`) ni un built-in de la plateforme. */
const externalImports = (file: string): string[] => {
  const src = readFileSync(file, 'utf8');
  const specs = [...src.matchAll(/^\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/gm)].map(m => m[1]);
  return specs.filter(s => !s.startsWith('.'));
};

describe.each(PURE)('packages/%s', (pkg) => {
  const root = join(PACKAGES_DIR, pkg);

  it('ne déclare aucune dépendance runtime', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(manifest.dependencies ?? {}).toEqual({});
  });

  it('n’importe rien d’extérieur dans ses sources', () => {
    const offenders = walk(join(root, 'src'))
      .flatMap(f => externalImports(f).map(spec => `${f.replace(PACKAGES_DIR + '/', '')} → ${spec}`));
    expect(offenders).toEqual([]);
  });

  it('n’utilise ni React, ni fetch, ni API Workers', () => {
    const forbidden = /\bfrom\s+['"]react|\bfetch\s*\(|\bD1Database\b|\bcaches\b|\blocalStorage\b|\bdocument\./;
    const offenders = walk(join(root, 'src')).filter(f => forbidden.test(readFileSync(f, 'utf8')));
    expect(offenders.map(f => f.replace(PACKAGES_DIR + '/', ''))).toEqual([]);
  });
});
