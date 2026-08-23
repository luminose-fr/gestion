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

/**
 * Le catalogue des actions réglables (Réglages → Modèle par action) doit
 * désigner des actions qui existent vraiment. Une entrée orpheline afficherait
 * un menu qui ne pilote rien.
 */
describe('catalogue des actions réglables', () => {
  it('ne référence que des actions déclarées', async () => {
    const { AI_ACTIONS, AI_ACTION_CATALOG } = await import('../src/actions');
    for (const action of AI_ACTION_CATALOG) {
      expect(Object.keys(AI_ACTIONS)).toContain(action.id);
    }
  });

  it('n’expose pas l’Intervieweur, dont plus aucun écran ne déclenche l’action', async () => {
    const { AI_ACTION_CATALOG } = await import('../src/actions');
    expect(AI_ACTION_CATALOG.map(a => a.id)).not.toContain('GENERATE_INTERVIEW');
  });

  /**
   * Le conseil de choix se lit à deux niveaux : la famille dit où mettre
   * l'argent, l'action dit ce qui lui est propre. Une action sans l'un des
   * deux laisse Florent choisir à l'aveugle.
   */
  it('dit pour chaque action ce qu’elle demande, et ce qui lui est propre', async () => {
    const { AI_ACTION_CATALOG, ATTENDU_FAMILLES, ATTENDU_ORDRE } = await import('../src/actions');
    for (const action of AI_ACTION_CATALOG) {
      const famille = ATTENDU_FAMILLES[action.attendu];
      expect(famille?.demande).toBeTruthy();
      expect(famille?.choix).toBeTruthy();
      expect(action.pourChoisir.length).toBeGreaterThan(20);
    }
  });

  it('range les familles du moins au plus exigeant, sans en oublier', async () => {
    const { AI_ACTION_CATALOG, ATTENDU_FAMILLES, ATTENDU_ORDRE } = await import('../src/actions');
    expect(ATTENDU_ORDRE).toEqual(Object.keys(ATTENDU_FAMILLES));
    // Toute famille utilisée par une action est rendue par l'écran.
    for (const action of AI_ACTION_CATALOG) {
      expect(ATTENDU_ORDRE).toContain(action.attendu);
    }
  });
});
