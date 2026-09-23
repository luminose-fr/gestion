/**
 * L'en-tête d'une carte ou d'un écran : un titre, parfois une précision,
 * parfois des actions à droite.
 *
 * `text-lg` partout — c'est le seul titre de l'échelle. `text-[20px]`,
 * `text-xl`, `text-2xl` et `text-3xl` disparaissent.
 *
 * `font-bold` et non `font-semibold` : c'est ce que portaient 14 des 16 titres
 * écrits à la main quand ce composant n'était encore utilisé nulle part. S'y
 * aligner ne déplace aucun écran ; l'inverse les aurait tous touchés.
 */
import React from 'react';

/**
 * Le titre sans son en-tête, pour les endroits où la ligne titre–actions n'a
 * pas de sens : un titre centré sous l'icône d'un vide ou d'une fenêtre, un
 * titre précédé de son icône, un titre éditable en place.
 */
export const CLASSES_TITRE = 'text-lg font-bold text-brand-main dark:text-white';

export interface TitreSectionProps {
  titre: React.ReactNode;
  /** Ce que le titre ne dit pas et qu'il faut savoir. `text-xs`. */
  sousTitre?: React.ReactNode;
  /** Les actions de l'en-tête, alignées à droite sur la ligne du titre. */
  action?: React.ReactNode;
  as?: 'h1' | 'h2' | 'h3' | 'h4';
  className?: string;
}

/*
  Sans sous-titre, les actions s'alignent sur le milieu du titre : un bouton
  petit (30 px) à côté d'une ligne de 28 px tomberait sinon d'un pixel par
  rapport au texte. Avec un sous-titre, elles restent en haut, sur la ligne
  du titre.
*/
export const TitreSection: React.FC<TitreSectionProps> = ({
  titre,
  sousTitre,
  action,
  as = 'h2',
  className = '',
}) => (
  <div
    className={[
      'flex justify-between gap-3',
      sousTitre ? 'items-start' : 'items-center',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
  >
    <div className="min-w-0">
      {React.createElement(as, { className: CLASSES_TITRE }, titre)}
      {sousTitre && (
        <p className="mt-1 text-xs text-brand-main/60 dark:text-dark-text/60">{sousTitre}</p>
      )}
    </div>
    {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
  </div>
);

export default TitreSection;
