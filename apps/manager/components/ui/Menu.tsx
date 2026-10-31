/**
 * Le menu flottant : « + Nouveau », « ⋯ », le sélecteur d'étape (SPEC §13).
 *
 * Il se ferme d'un clic dehors ou d'Échap, et un seul est ouvert à la fois :
 * c'est l'écran qui tient lequel (`ouvert`), pas le menu. Les entrées font
 * 44 px, la cible d'une ligne qu'on vise sans viser. Une entrée indisponible
 * reste visible, à 40 %, avec sa raison en info-bulle : un geste qui disparaît
 * n'apprend pas pourquoi.
 */
import React, { useEffect, useRef } from 'react';
import { useMenuNavigation } from '../hooks/useMenuNavigation';

export interface EntreeMenu {
  id: string;
  libelle: React.ReactNode;
  /** Une ligne d'aide sous le libellé. */
  aide?: React.ReactNode;
  icone?: React.ReactNode;
  /** À droite de l'entrée : un état (« relu : Publiable », « verrouillée »). */
  aDroite?: React.ReactNode;
  onChoisir: () => void;
  desactive?: boolean;
  /** Pourquoi l'entrée est indisponible. */
  raison?: string;
  /** L'entrée courante, marquée. */
  courante?: boolean;
  ton?: 'neutre' | 'erreur';
}

export interface MenuProps {
  ouvert: boolean;
  onFermer: () => void;
  entrees: EntreeMenu[];
  /** Le déclencheur : le bouton qui ouvre le menu. */
  children: React.ReactNode;
  /** Un titre au-dessus des entrées (« Aller à une étape »). */
  titre?: React.ReactNode;
  /** `largeur` en pixels : 260, 280 ou 320 selon le menu. */
  largeur?: 260 | 280 | 320;
  alignement?: 'gauche' | 'droite';
  className?: string;
}

const LARGEURS = { 260: 'w-[260px]', 280: 'w-[280px]', 320: 'w-[320px]' } as const;

export const Menu: React.FC<MenuProps> = ({
  ouvert, onFermer, entrees, children, titre, largeur = 280, alignement = 'droite', className = '',
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useMenuNavigation(ouvert, ref, onFermer);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onFermer(); };
    document.addEventListener('mousedown', dehors);
    return () => {
      document.removeEventListener('mousedown', dehors);
    };
  }, [ouvert, onFermer]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      {React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>, {
        'aria-haspopup': 'menu', 'aria-expanded': ouvert,
      }) : children}
      {ouvert && (
        <div
          role="menu"
          className={`absolute z-30 mt-1 ${alignement === 'droite' ? 'right-0' : 'left-0'} ${LARGEURS[largeur]} max-w-[calc(100vw-2rem)] rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface shadow-lg p-1`}
        >
          {titre && (
            <p className="px-3 pt-2 pb-1 text-micro font-bold uppercase tracking-wider text-brand-main dark:text-dark-text">{titre}</p>
          )}
          {entrees.map(e => (
            <button
              key={e.id}
              type="button"
              role="menuitem"
              disabled={e.desactive}
              title={e.desactive ? e.raison : undefined}
              aria-current={e.courante || undefined}
              onClick={() => { e.onChoisir(); onFermer(); }}
              className={`w-full min-h-11 flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                e.courante ? 'bg-brand-light dark:bg-dark-bg' : 'hover:bg-brand-light dark:hover:bg-dark-bg'
              } ${e.ton === 'erreur' ? 'text-erreur' : 'text-brand-main dark:text-dark-text'} [&_svg]:size-4 [&_svg]:shrink-0`}
            >
              {e.icone}
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold truncate">{e.libelle}</span>
                {e.aide && <span className="block text-xs text-brand-main dark:text-dark-text">{e.aide}</span>}
              </span>
              {e.aDroite && <span className="shrink-0 text-xs text-brand-main dark:text-dark-text">{e.aDroite}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Menu;
