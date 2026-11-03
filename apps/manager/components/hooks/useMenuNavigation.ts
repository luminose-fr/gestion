import { useEffect, useRef, type RefObject } from 'react';

/** Même navigation clavier pour les menus d'actions et le sélecteur d'étape. */
export function useMenuNavigation(ouvert: boolean, racine: RefObject<HTMLDivElement | null>, fermer: () => void) {
  const fermeture = useRef(fermer);
  fermeture.current = fermer;
  useEffect(() => {
    if (!ouvert || !racine.current) return;
    const root = racine.current;
    const declencheur = root.querySelector<HTMLButtonElement>('button');
    const choix = () => [...root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];
    choix()[0]?.focus();
    const clavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); fermeture.current(); declencheur?.focus();
      } else if (e.key === 'Tab') {
        fermeture.current();
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        const items = choix();
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
          : (i + (e.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
        items[n]?.focus();
      }
    };
    root.addEventListener('keydown', clavier);
    return () => root.removeEventListener('keydown', clavier);
  }, [ouvert, racine]);
}
