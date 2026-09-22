/**
 * L'en-tête d'une carte ou d'un écran : un titre, parfois une précision,
 * parfois des actions à droite.
 *
 * `text-lg` partout — c'est le seul titre de l'échelle. `text-[20px]`,
 * `text-xl`, `text-2xl` et `text-3xl` disparaissent.
 */
import React from 'react';

export interface TitreSectionProps {
  titre: React.ReactNode;
  /** Ce que le titre ne dit pas et qu'il faut savoir. `text-xs`. */
  sousTitre?: React.ReactNode;
  /** Les actions de l'en-tête, alignées à droite sur la ligne du titre. */
  action?: React.ReactNode;
  as?: 'h1' | 'h2' | 'h3' | 'h4';
  className?: string;
}

export const TitreSection: React.FC<TitreSectionProps> = ({
  titre,
  sousTitre,
  action,
  as = 'h2',
  className = '',
}) => (
  <div className={['flex items-start justify-between gap-3', className].filter(Boolean).join(' ')}>
    <div className="min-w-0">
      {React.createElement(
        as,
        { className: 'text-lg font-semibold text-brand-main dark:text-white' },
        titre,
      )}
      {sousTitre && (
        <p className="mt-1 text-xs text-brand-main/60 dark:text-dark-text/60">{sousTitre}</p>
      )}
    </div>
    {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
  </div>
);

export default TitreSection;
