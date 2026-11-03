import { useEffect, useRef } from 'react';

/** Le clavier reste dans la confirmation, puis retrouve le contrôle qui l'a ouverte. */
export function useModalFocus(ouvert: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert || !ref.current) return;
    const modal = ref.current;
    const avant = document.activeElement as HTMLElement | null;
    const cibles = () => [...modal.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')];
    (cibles()[0] ?? modal).focus();
    const tabuler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = cibles();
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (!items.length) { e.preventDefault(); modal.focus(); }
      else if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
      else if (!e.shiftKey && (i < 0 || i === items.length - 1)) { e.preventDefault(); items[0].focus(); }
    };
    modal.addEventListener('keydown', tabuler);
    return () => { modal.removeEventListener('keydown', tabuler); if (avant?.isConnected) avant.focus(); };
  }, [ouvert]);
  return ref;
}
