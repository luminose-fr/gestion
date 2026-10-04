import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReelExplique } from '@luminose/editorial';
import * as Api from '../../services/apiService';
import type { Montage } from './useMontage';

export interface VisuelAffiche {
    url: string;
    /** La carte a changé de description depuis le dépôt : l'image répondait à une autre demande. */
    perime: boolean;
}

export interface VisuelsReel {
    /** Le visuel déposé pour un élément, s'il y en a un et qu'il est arrivé. */
    visuel: (sequence: number, element: number) => VisuelAffiche | undefined;
    /** Les visuels d'une scène, par rang d'élément — la forme qu'attend `SceneLuminose`. */
    deLaScene: (sequence: number) => Record<number, string>;
    deposer: (sequence: number, element: number, fichier: File) => Promise<void>;
    retirer: (sequence: number, element: number) => Promise<void>;
    /** R2 n'est pas lié au Worker : rien ne se dépose, et on le dit au lieu d'échouer au clic. */
    indisponible: boolean;
}

/**
 * Les visuels d'un Reel expliqué, rangés chez Cloudflare (SPEC §12.4) : déposés
 * sur un poste, ils sont là sur tous. Les images arrivent après l'état ; une
 * carte dont l'image n'est pas encore là garde son gabarit, rien ne clignote.
 */
export function useVisuelsReel(contentId: string | undefined, data: ReelExplique, montage: Montage): VisuelsReel {
    const visuels = montage.etat?.visuels ?? [];
    // Une URL par objet R2 : un visuel remplacé change d'objet, donc d'URL.
    const [urls, setUrls] = useState<Record<string, string>>({});
    // Ce qui est déjà demandé. Sans ce registre, chaque relecture de l'état
    // relançait le téléchargement d'une image encore en route, et en changeait
    // l'URL — y compris pendant un export qui s'en servait.
    const demandes = useRef(new Set<string>());

    useEffect(() => {
        if (!contentId) return;
        for (const v of visuels) {
            if (demandes.current.has(v.r2Cle)) continue;
            demandes.current.add(v.r2Cle);
            Api.lireVisuelDistant(contentId, v.sequence, v.element)
                .then(blob => setUrls(u => u[v.r2Cle] ? u : { ...u, [v.r2Cle]: URL.createObjectURL(blob) }))
                .catch(() => {
                    // Une image qui n'arrive pas laisse son gabarit : la carte reste
                    // lisible, et la prochaine relecture réessaiera.
                    demandes.current.delete(v.r2Cle);
                });
        }
    }, [contentId, visuels]);

    // Les URL des visuels retirés ou remplacés se libèrent : chacune retient une image en mémoire.
    useEffect(() => {
        const vivantes = new Set(visuels.map(v => v.r2Cle));
        const perimees = Object.keys(urls).filter(cle => !vivantes.has(cle));
        if (perimees.length === 0) return;
        perimees.forEach(cle => { URL.revokeObjectURL(urls[cle]); demandes.current.delete(cle); });
        setUrls(u => Object.fromEntries(Object.entries(u).filter(([cle]) => vivantes.has(cle))));
    }, [visuels, urls]);

    const descriptionActuelle = useCallback((sequence: number, element: number) =>
        data.sequences?.[sequence]?.elements?.[element]?.visuel?.description ?? '', [data]);

    const visuel = useCallback((sequence: number, element: number): VisuelAffiche | undefined => {
        const v = visuels.find(x => x.sequence === sequence && x.element === element);
        if (!v || !urls[v.r2Cle]) return undefined;
        return { url: urls[v.r2Cle], perime: v.description !== descriptionActuelle(sequence, element) };
    }, [visuels, urls, descriptionActuelle]);

    const deLaScene = useCallback((sequence: number): Record<number, string> => {
        const parElement: Record<number, string> = {};
        (data.sequences?.[sequence]?.elements ?? []).forEach((_, element) => {
            const v = visuel(sequence, element);
            if (v) parElement[element] = v.url;
        });
        return parElement;
    }, [data, visuel]);

    const deposer = useCallback(async (sequence: number, element: number, fichier: File) => {
        if (!contentId) return;
        await Api.deposerVisuelDistant(contentId, sequence, element, fichier, descriptionActuelle(sequence, element));
        await montage.recharger();
    }, [contentId, descriptionActuelle, montage]);

    const retirer = useCallback(async (sequence: number, element: number) => {
        if (!contentId) return;
        await Api.retirerVisuelDistant(contentId, sequence, element);
        await montage.recharger();
    }, [contentId, montage]);

    return { visuel, deLaScene, deposer, retirer, indisponible: !montage.etat?.stockage.disponible };
}
