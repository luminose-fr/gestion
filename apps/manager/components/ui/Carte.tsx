/**
 * La carte — une surface, une bordure, un rayon.
 *
 * Deux conventions de bordure se disputaient les écrans (`border-brand-border`
 * contre `border-brand-light`, et côté sombre `dark:border-dark-sec-border`
 * contre `dark:border-dark-sec-bg`). Celle qui reste est la majoritaire ; elle
 * n'est plus écrite qu'ici.
 */
import React from 'react';

/** La densité dit à quoi sert la carte, pas combien de pixels elle prend. */
export type DensiteCarte = 'liste' | 'contenu' | 'seule' | 'tableau';

const DENSITES: Record<DensiteCarte, string> = {
  liste: 'p-4',
  contenu: 'p-5',
  seule: 'p-6',
  /**
   * Un tableau, ou une liste de lignes, porte son propre padding de cellule :
   * la carte n'en ajoute pas, et rogne ce qui dépasse de son rayon.
   * `className="p-0"` ne ferait pas l'affaire — deux paddings sur le même
   * élément se départagent dans l'ordre de la feuille, pas de l'attribut.
   */
  tableau: 'overflow-hidden',
};

export interface CarteProps extends React.HTMLAttributes<HTMLDivElement> {
  densite?: DensiteCarte;
  /** `shadow-xs` — une carte posée sur le fond, pas une carte au fil du texte. */
  posee?: boolean;
  /**
   * Le rythme interne (`space-y-3`). Facultatif, parce qu'une carte migrée
   * gère souvent déjà ses écarts : l'imposer déplacerait des écrans qu'on ne
   * regarde pas.
   */
  rythme?: boolean;
}

export const Carte: React.FC<CarteProps> = ({
  densite = 'liste',
  posee = false,
  rythme = false,
  className = '',
  ...reste
}) => (
  <div
    className={[
      'rounded-xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-sec-border',
      DENSITES[densite],
      posee ? 'shadow-xs' : '',
      rythme ? 'space-y-3' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    {...reste}
  />
);

export default Carte;
