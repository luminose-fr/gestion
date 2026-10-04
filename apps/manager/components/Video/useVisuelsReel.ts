import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReelExplique } from '@luminose/editorial';
import * as Visuels from '../../services/visuelsService';

export interface VisuelAffiche {
    url: string;
    /** La carte a changé de description depuis le dépôt : l'image répondait à une autre demande. */
    perime: boolean;
}

export interface VisuelsReel {
    /** Le visuel déposé pour un élément, s'il y en a un. */
    visuel: (sequence: number, element: number) => VisuelAffiche | undefined;
    /** Les visuels d'une scène, par rang d'élément — la forme qu'attend `SceneLuminose`. */
    deLaScene: (sequence: number) => Record<number, string>;
    deposer: (sequence: number, element: number, fichier: File) => Promise<void>;
    retirer: (sequence: number, element: number) => Promise<void>;
    /** Le navigateur refuse IndexedDB (navigation privée, données bloquées) : on le dit au lieu d'échouer en silence. */
    indisponible: boolean;
}

/**
 * Les visuels d'un Reel expliqué, tels que déposés sur ce poste. Sans contenu
 * enregistré, rien ne se lit ni ne s'écrit : un dépôt doit pouvoir se retrouver.
 */
export function useVisuelsReel(contenuId: string | undefined, data: ReelExplique): VisuelsReel {
    const [depots, setDepots] = useState<Visuels.VisuelDepose[]>([]);
    const [indisponible, setIndisponible] = useState(false);

    const recharger = useCallback(async () => {
        if (!contenuId) return;
        try {
            setDepots(await Visuels.listerVisuels(contenuId));
            setIndisponible(false);
        } catch {
            setIndisponible(true);
        }
    }, [contenuId]);

    useEffect(() => { void recharger(); }, [recharger]);

    // Une URL par image, révoquée quand les dépôts changent : sans ça, chaque
    // dépôt laisserait une copie de l'image en mémoire jusqu'à la fermeture.
    const urls = useMemo(
        () => Object.fromEntries(depots.map(d => [d.cle, URL.createObjectURL(d.image)])) as Record<string, string>,
        [depots],
    );
    useEffect(() => () => Object.values(urls).forEach(url => URL.revokeObjectURL(url)), [urls]);

    const descriptionActuelle = useCallback((sequence: number, element: number) =>
        data.sequences?.[sequence]?.elements?.[element]?.visuel?.description ?? '', [data]);

    const visuel = useCallback((sequence: number, element: number): VisuelAffiche | undefined => {
        if (!contenuId) return undefined;
        const cle = Visuels.cleVisuel(contenuId, sequence, element);
        const depot = depots.find(d => d.cle === cle);
        if (!depot || !urls[cle]) return undefined;
        return { url: urls[cle], perime: depot.description !== descriptionActuelle(sequence, element) };
    }, [contenuId, depots, urls, descriptionActuelle]);

    const deLaScene = useCallback((sequence: number): Record<number, string> => {
        const parElement: Record<number, string> = {};
        (data.sequences?.[sequence]?.elements ?? []).forEach((_, element) => {
            const v = visuel(sequence, element);
            if (v) parElement[element] = v.url;
        });
        return parElement;
    }, [data, visuel]);

    const deposer = useCallback(async (sequence: number, element: number, fichier: File) => {
        if (!contenuId) return;
        await Visuels.deposerVisuel({
            cle: Visuels.cleVisuel(contenuId, sequence, element),
            contenuId, sequence, element,
            description: descriptionActuelle(sequence, element),
            image: fichier,
            deposeLe: Date.now(),
        });
        await recharger();
    }, [contenuId, descriptionActuelle, recharger]);

    const retirer = useCallback(async (sequence: number, element: number) => {
        if (!contenuId) return;
        await Visuels.retirerVisuel(Visuels.cleVisuel(contenuId, sequence, element));
        await recharger();
    }, [contenuId, recharger]);

    return { visuel, deLaScene, deposer, retirer, indisponible };
}
