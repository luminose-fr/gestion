/**
 * La barre d'avancement d'un contenu : un segment par étape de son fil
 * (SPEC §13.2). Fait, en cours, à venir ; toute verte quand le contenu est
 * complet — bon à publier, exporté, publié.
 *
 * Elle se lit avant le libellé qu'elle accompagne : c'est elle qui fait voir,
 * dans une liste, lesquels sont près de la sortie.
 */
import React from 'react';

export type EtatSegment = 'fait' | 'encours' | 'avenir';

const COULEURS: Record<EtatSegment, string> = {
  fait: 'bg-brand-main dark:bg-dark-text',
  encours: 'bg-brand-main/40 dark:bg-dark-text/40',
  avenir: 'bg-brand-border dark:bg-dark-sec-border',
};

export interface BarreProgressionProps {
  segments: EtatSegment[];
  complet?: boolean;
  /** `fine` : 5 px, dans le sélecteur d'étape et le panneau Série ; sinon 6 px. */
  fine?: boolean;
  className?: string;
}

export const BarreProgression: React.FC<BarreProgressionProps> = ({ segments, complet = false, fine = false, className = '' }) => (
  <div
    className={`flex gap-[3px] ${className}`}
    role="img"
    aria-label={`${segments.filter(s => s === 'fait').length} étape${segments.filter(s => s === 'fait').length > 1 ? 's' : ''} sur ${segments.length}`}
  >
    {segments.map((s, i) => (
      <span
        key={i}
        className={`flex-1 rounded-full ${fine ? 'h-[5px]' : 'h-1.5'} ${complet ? 'bg-succes' : COULEURS[s]}`}
      />
    ))}
  </div>
);

export default BarreProgression;
