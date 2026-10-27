/**
 * Le contrôle segmenté : quelques choix exclusifs, côte à côte, dans un seul
 * cadre de 40 px (SPEC §13, passation « Contenus, le fil »).
 *
 * Il sert aux filtres d'une liste (Tout · Écrire · Tourner…), à la vue des
 * Publiés (Liste · Calendrier), à la sortie du studio (9:16 · 4:5). Des
 * boutons séparés se lisaient comme des actions ; un cadre commun dit qu'on
 * choisit UNE chose parmi d'autres.
 */
import React from 'react';

export interface OptionSegment<T extends string> {
  valeur: T;
  libelle: React.ReactNode;
  /** Un compteur, en pastille : combien de lignes ce filtre garde. */
  compte?: number;
  desactive?: boolean;
  /** Ce que l'option fait, ou pourquoi elle est indisponible. */
  titre?: string;
}

export interface ControleSegmenteProps<T extends string> {
  valeur: T;
  options: Array<OptionSegment<T>>;
  onChange: (valeur: T) => void;
  /** Ce que le contrôle choisit, pour un lecteur d'écran. */
  libelle?: string;
  className?: string;
}

export function ControleSegmente<T extends string>({
  valeur, options, onChange, libelle, className = '',
}: ControleSegmenteProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={libelle}
      className={`inline-flex items-center gap-1 h-10 p-1 rounded-lg border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface shrink-0 ${className}`}
    >
      {options.map(o => {
        const actif = o.valeur === valeur;
        return (
          <button
            key={o.valeur}
            type="button"
            role="radio"
            aria-checked={actif}
            disabled={o.desactive}
            title={o.titre}
            onClick={() => onChange(o.valeur)}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-semibold whitespace-nowrap transition-colors disabled:opacity-40 ${
              actif
                ? 'bg-brand-main text-white dark:bg-white dark:text-brand-main'
                : 'text-brand-main/70 dark:text-dark-text/70 hover:text-brand-main dark:hover:text-white'
            }`}
          >
            {o.libelle}
            {o.compte !== undefined && (
              <span className={`text-micro font-bold tabular-nums ${actif ? 'text-white/80 dark:text-brand-main/70' : 'text-brand-main/50 dark:text-dark-text/50'}`}>
                {o.compte}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default ControleSegmente;
