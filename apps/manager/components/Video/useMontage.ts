import { useCallback, useEffect, useState } from 'react';
import type { EtatMontage } from '@luminose/shared';
import * as Api from '../../services/apiService';

/**
 * L'état du montage d'un contenu, tel que le Worker le range (SPEC §12.4) :
 * prises, visuels, et l'espace occupé dans R2. Lu une fois à l'ouverture du
 * storyboard, relu après chaque dépôt.
 */
export interface Montage {
    etat: EtatMontage | null;
    erreur: string | null;
    recharger: () => Promise<void>;
}

/** Une réponse incomplète ne doit rien casser : un champ absent vaut vide, et R2 absent. */
const normaliser = (e: any): EtatMontage => ({
    prises: Array.isArray(e?.prises) ? e.prises : [],
    visuels: Array.isArray(e?.visuels) ? e.visuels : [],
    stockage: {
        octets: Number(e?.stockage?.octets ?? 0),
        plafond: Number(e?.stockage?.plafond ?? 0),
        disponible: e?.stockage?.disponible === true,
    },
});

export function useMontage(contentId: string | undefined): Montage {
    const [etat, setEtat] = useState<EtatMontage | null>(null);
    const [erreur, setErreur] = useState<string | null>(null);

    const recharger = useCallback(async () => {
        if (!contentId) return;
        try {
            setEtat(normaliser(await Api.fetchMontage(contentId)));
            setErreur(null);
        } catch (e: any) {
            setErreur(e?.message ?? String(e));
        }
    }, [contentId]);

    useEffect(() => { void recharger(); }, [recharger]);

    return { etat, erreur, recharger };
}
