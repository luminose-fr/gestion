/**
 * Quitter un écran avec des modifications non enregistrées demande
 * confirmation (retours du 28/11, §2.4).
 *
 * Toute navigation de la console passe par l'adresse (`#…`) : la coque
 * consulte `peutQuitter()` à chaque changement d'adresse, et remet l'ancienne
 * si l'on refuse. Un écran pose sa garde par `useGardeQuitter`. Fermer
 * l'onglet passe par `beforeunload`, que le navigateur formule lui-même.
 */
import { useEffect, useRef } from 'react';

const gardes = new Set<{ current: boolean }>();

export const MESSAGE_QUITTER = 'Des modifications ne sont pas enregistrées. Quitter sans les enregistrer ?';

export const aDesModifications = () => [...gardes].some((g) => g.current);

/** Vrai si rien n'attend, ou si l'on accepte de perdre ce qui attend. */
export const peutQuitter = () => !aDesModifications() || window.confirm(MESSAGE_QUITTER);

export const useGardeQuitter = (modifie: boolean) => {
  const ref = useRef(modifie);
  ref.current = modifie;
  useEffect(() => {
    gardes.add(ref);
    const avantDePartir = (e: BeforeUnloadEvent) => { if (ref.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', avantDePartir);
    return () => { gardes.delete(ref); window.removeEventListener('beforeunload', avantDePartir); };
  }, []);
};
