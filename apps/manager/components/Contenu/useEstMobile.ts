import { useEffect, useState } from 'react';

/**
 * Sous 768 px — le seuil `md` de Tailwind —, l'écran est un téléphone (SPEC
 * §13.13) : le contenu se lit en deux onglets, et le studio ne se monte pas.
 * Un hook plutôt qu'une classe `hidden` : on ne veut pas charger Remotion pour
 * un écran qu'on ne montrera pas.
 */
const REQUETE = '(max-width: 767px)';

export function useEstMobile(): boolean {
    const lire = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REQUETE).matches;
    const [mobile, setMobile] = useState(lire);
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const media = window.matchMedia(REQUETE);
        const suivre = () => setMobile(media.matches);
        media.addEventListener?.('change', suivre);
        return () => media.removeEventListener?.('change', suivre);
    }, []);
    return mobile;
}
