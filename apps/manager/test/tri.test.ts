/**
 * Le tri des tableaux (SPEC §3.7).
 *
 * Deux règles seulement, mais elles valaient d'être écrites une fois : le clic
 * qui inverse ou repart, et le réglage retenu qui désigne une colonne disparue.
 */
import { describe, it, expect } from 'vitest';
import { triSuivant, triValide, type Tri } from '../components/TriTableau';

const COLONNES = ['statut', 'contenu', 'format'] as const;
const DEFAUT: Tri = { colonne: 'contenu', sens: 'asc' };

describe('le clic sur un en-tête', () => {
  it('inverse le sens quand c’est la même colonne', () => {
    expect(triSuivant({ colonne: 'format', sens: 'asc' }, 'format')).toEqual({ colonne: 'format', sens: 'desc' });
    expect(triSuivant({ colonne: 'format', sens: 'desc' }, 'format')).toEqual({ colonne: 'format', sens: 'asc' });
  });

  it('repart en croissant sur une autre colonne', () => {
    expect(triSuivant({ colonne: 'format', sens: 'desc' }, 'statut')).toEqual({ colonne: 'statut', sens: 'asc' });
  });
});

describe('un tri repris du compte', () => {
  it('est appliqué tel quel quand la colonne existe', () => {
    expect(triValide({ colonne: 'statut', sens: 'desc' }, COLONNES, DEFAUT))
      .toEqual({ colonne: 'statut', sens: 'desc' });
  });

  /**
   * Le cas qui compte : une colonne retirée de l'écran, ou un réglage venu
   * d'une version d'avant. Trier sur rien afficherait une liste dans un ordre
   * que personne n'a demandé.
   */
  it('retombe sur le défaut quand la colonne n’existe plus', () => {
    expect(triValide({ colonne: 'colonneRetiree', sens: 'desc' }, COLONNES, DEFAUT)).toEqual(DEFAUT);
    expect(triValide(null, COLONNES, DEFAUT)).toEqual(DEFAUT);
    expect(triValide(undefined, COLONNES, DEFAUT)).toEqual(DEFAUT);
    expect(triValide({}, COLONNES, DEFAUT)).toEqual(DEFAUT);
  });

  it('un sens illisible vaut croissant, pas une erreur', () => {
    expect(triValide({ colonne: 'statut', sens: 'diagonal' }, COLONNES, DEFAUT))
      .toEqual({ colonne: 'statut', sens: 'asc' });
  });
});
