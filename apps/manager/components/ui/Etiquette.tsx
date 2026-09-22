/**
 * L'étiquette : sur-titre en capitales, pastille, mention.
 *
 * `text-[9px]`, `[10px]` et `[11px]` se partageaient 227 occurrences pour dire
 * la même chose. Une seule taille désormais, `text-micro`.
 */
import React from 'react';

export type FormeEtiquette = 'surtitre' | 'pastille';
/**
 * Le sens d'une pastille. `succes`, `alerte` et `erreur` passent par les
 * tokens de `@theme` — plus de `green-*`, `emerald-*`, `amber-*` ni `red-*`
 * écrits à la main. Le token change de valeur en sombre : aucune classe `dark:`.
 */
export type TonEtiquette = 'neutre' | 'succes' | 'alerte' | 'erreur';

/*
  Les capitales sont au sur-titre seul. Une pastille porte un verdict, un
  format, une plateforme — des mots qu'on lit, parfois longs (« Script vidéo
  YouTube ») : en capitales espacées, ils déborderaient des colonnes.
*/
const SURTITRE = 'block text-micro font-bold uppercase tracking-wider text-brand-main/60 dark:text-dark-text/50';
const PASTILLE =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-micro font-semibold [&_svg]:size-3 [&_svg]:shrink-0';

const TONS: Record<TonEtiquette, string> = {
  neutre: 'bg-brand-main/10 text-brand-main dark:bg-white/15 dark:text-white',
  succes: 'bg-succes/10 text-succes',
  alerte: 'bg-alerte/10 text-alerte',
  erreur: 'bg-erreur/10 text-erreur',
};

export interface EtiquetteProps extends React.HTMLAttributes<HTMLElement> {
  forme?: FormeEtiquette;
  /** Ne vaut que pour la pastille. */
  ton?: TonEtiquette;
  /** `label` quand l'étiquette nomme un champ, `span` dans un flux de texte. */
  as?: 'p' | 'span' | 'div' | 'label' | 'h2' | 'h3';
  htmlFor?: string;
}

export const Etiquette: React.FC<EtiquetteProps> = ({
  forme = 'surtitre',
  ton = 'neutre',
  as = 'p',
  className = '',
  ...reste
}) => {
  const classes = forme === 'pastille' ? `${PASTILLE} ${TONS[ton]}` : SURTITRE;
  return React.createElement(as, {
    className: [classes, className].filter(Boolean).join(' '),
    ...reste,
  });
};

export default Etiquette;
