/**
 * Le tri des tableaux — une seule autorité pour tous les écrans.
 *
 * L'en-tête cliquable et la règle du clic vivaient dans `ContentTable`, où les
 * Séries ne pouvaient pas y accéder : leur tableau n'avait donc aucun tri. Les
 * deux sont ici, et le prochain tableau les prendra sans les réécrire.
 *
 * Le tri lui-même n'est PAS un état local : il est fourni et remonté, parce
 * qu'il se conserve d'une visite à l'autre, côté serveur (SPEC §3.7).
 */
import React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export interface Tri {
  colonne: string;
  sens: 'asc' | 'desc';
}

/**
 * Ce que devient le tri quand on clique sur une colonne : la même colonne
 * s'inverse, une autre repart en croissant. C'est la convention de tous les
 * tableaux de l'application, et elle n'a de sens qu'énoncée une fois.
 */
export const triSuivant = (actuel: Tri, colonne: string): Tri =>
  actuel.colonne === colonne
    ? { colonne, sens: actuel.sens === 'asc' ? 'desc' : 'asc' }
    : { colonne, sens: 'asc' };

/** Comparaison de chaînes en français : accents ignorés, nombres ordonnés. */
export const comparateurFr = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

/**
 * Un réglage retenu peut désigner une colonne qui n'existe plus — un tableau
 * dont on a retiré une colonne, un réglage venu d'une version d'avant. Il
 * retombe alors sur le défaut, plutôt que de trier sur rien.
 */
export const triValide = (
  candidat: { colonne?: string; sens?: string } | null | undefined,
  colonnes: readonly string[],
  defaut: Tri,
): Tri => {
  if (!candidat?.colonne || !colonnes.includes(candidat.colonne)) return defaut;
  return { colonne: candidat.colonne, sens: candidat.sens === 'desc' ? 'desc' : 'asc' };
};

const TH_BASE =
  'px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55';

export const EnTeteTriable: React.FC<{
  colonne: string;
  label: string;
  tri: Tri;
  onTri: (colonne: string) => void;
  className?: string;
}> = ({ colonne, label, tri, onTri, className = '' }) => {
  const actif = tri.colonne === colonne;
  const Icone = !actif ? ChevronsUpDown : tri.sens === 'asc' ? ChevronUp : ChevronDown;

  return (
    <th className={`${TH_BASE} ${className}`} aria-sort={actif ? (tri.sens === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onTri(colonne)}
        className={`inline-flex items-center gap-1 group transition-colors ${
          actif ? 'text-brand-main dark:text-white' : 'hover:text-brand-main dark:hover:text-white'
        }`}
        title={actif ? `Tri : ${tri.sens === 'asc' ? 'croissant' : 'décroissant'} (clic pour inverser)` : `Trier par ${label}`}
      >
        {label}
        <Icone className={`w-3 h-3 ${actif ? 'opacity-100' : 'opacity-40 group-hover:opacity-70'} transition-opacity`} />
      </button>
    </th>
  );
};

/** L'en-tête d'une colonne qui ne se trie pas — même style, sans le bouton. */
export const EnTeteSimple: React.FC<{ label: string; className?: string }> = ({ label, className = '' }) => (
  <th className={`${TH_BASE} ${className}`}>{label}</th>
);
