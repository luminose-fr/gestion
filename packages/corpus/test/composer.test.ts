import { describe, expect, it } from 'vitest';
import { charger } from '../src/charger.ts';
import { composer } from '../src/composer.ts';
import { separerFrontmatter } from '../src/frontmatter.ts';
import { PROFILS } from '../src/profils.ts';
import type { Document } from '../src/types.ts';

const docs = charger();
const D = '2026-08-26';

describe('frontmatter', () => {
  it('lit les formes que le corpus emploie', () => {
    const { meta, corps } = separerFrontmatter(
      `---\ntype: decision\nnoyau: true\nreview_at: 2027-08\ntouche: [a/b, c]\nvide:\n---\n\n# Titre\n\ncorps`,
    );
    expect(meta.type).toBe('decision');
    expect(meta.noyau).toBe(true);
    expect(meta.review_at).toBe('2027-08');
    expect(meta.touche).toEqual(['a/b', 'c']);
    expect(meta.vide).toBeNull();
    expect(corps.startsWith('# Titre')).toBe(true);
  });

  it('ne casse pas sur un document sans frontmatter', () => {
    const { meta, corps } = separerFrontmatter('# Rien\n\ndu texte');
    expect(meta).toEqual({});
    expect(corps).toBe('# Rien\n\ndu texte');
  });
});

describe('le corpus se charge', () => {
  it('trouve des documents et aucun README', () => {
    expect(docs.length).toBeGreaterThan(15);
    expect(docs.some((d) => d.chemin.endsWith('README'))).toBe(false);
  });
});

describe('le hash', () => {
  it('ne dépend pas de la date — sinon « périmé » ne voudrait rien dire', () => {
    const a = composer(docs, 'complet', '2026-08-26');
    const b = composer(docs, 'complet', '2027-01-01');
    expect(a.hash).toBe(b.hash);
    expect(a.texte).not.toBe(b.texte);
  });

  it('change quand le contenu change', () => {
    const modifie: Document[] = docs.map((d, i) =>
      i === 0 ? { ...d, corps: d.corps + '\nune ligne de plus' } : d,
    );
    expect(composer(modifie, 'complet', D).hash).not.toBe(
      composer(docs, 'complet', D).hash,
    );
  });

  it('est propre à chaque profil', () => {
    const h = new Set(
      (['noyau', 'complet', 'strategie'] as const).map(
        (p) => composer(docs, p, D).hash,
      ),
    );
    expect(h.size).toBe(3);
  });
});

describe('les frontières entre profils — NORMATIF', () => {
  it('« strategie » n\'entre JAMAIS dans le profil complet', () => {
    const c = composer(docs, 'complet', D);
    expect(c.documents.every((p) => !p.startsWith('strategie/'))).toBe(true);
  });

  it('l\'inbox n\'entre dans aucun profil', () => {
    for (const p of ['noyau', 'complet', 'strategie'] as const) {
      expect(composer(docs, p, D).documents).not.toContain('inbox');
    }
  });

  it('un document « candidat » reste hors du profil complet', () => {
    const candidats = docs
      .filter((d) => d.meta.statut === 'candidat')
      .map((d) => d.chemin);
    const c = composer(docs, 'complet', D);
    for (const p of candidats) expect(c.documents).not.toContain(p);
  });

  it('le noyau tient sous le plafond d\'un champ d\'instructions', () => {
    const c = composer(docs, 'noyau', D);
    expect(c.documents.length).toBeGreaterThan(0);
    expect(c.taille).toBeLessThanOrEqual(PROFILS.noyau.plafond!);
  });
});

describe('le garde-fou des offres — NORMATIF', () => {
  it('marque « NE PAS PROPOSER » toute offre non active, dans les trois profils', () => {
    const arretees = docs.filter(
      (d) =>
        d.chemin.startsWith('socle/offres/') &&
        ['suspendu', 'termine', 'candidat'].includes(d.meta.statut as string),
    );
    expect(arretees.length).toBeGreaterThan(0);

    for (const p of ['noyau', 'complet', 'strategie'] as const) {
      const t = composer(docs, p, D).texte;
      expect(t).toContain('NE PAS PROPOSER');
      expect(t).toContain('RÈGLE ABSOLUE');
    }
  });

  it('Le Seuil est présent dans le tableau et marqué comme non proposable', () => {
    const t = composer(docs, 'complet', D).texte;
    const ligne = t.split('\n').find((l) => l.includes('Le Seuil') && l.includes('|'));
    expect(ligne).toBeDefined();
    expect(ligne).toContain('suspendu');
    expect(ligne).toContain('NE PAS PROPOSER');
  });
});
