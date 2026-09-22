/**
 * La gouttière d'écran et les deux gabarits de zone de travail.
 *
 * Dix largeurs maximales cohabitaient, de `max-w-xs` à `max-w-6xl`, et deux
 * gouttières concurrentes. Un écran choisit désormais un gabarit, pas une
 * largeur : ce qui s'affiche en grille est une liste, tout le reste est du
 * travail — confirmations et écrans à une décision compris.
 */

export const GOUTTIERE = 'px-4 md:px-6 py-5';

export type Gabarit = 'liste' | 'travail';

export const GABARITS: Record<Gabarit, string> = {
  /** Tableaux, grilles, calendrier. */
  liste: 'max-w-6xl mx-auto',
  /** Formulaires, éditeur, réglages, confirmations. */
  travail: 'max-w-3xl mx-auto',
};

export const ecran = (gabarit: Gabarit) => `${GOUTTIERE} ${GABARITS[gabarit]}`;
