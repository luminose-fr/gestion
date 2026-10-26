import React, { Suspense, lazy, useMemo } from 'react';
import { montageDuBrouillon, scriptDepuisLaTranscription, type ReelExplique } from '@luminose/editorial';
import { Patience } from '../Feedback';
import { useMontage } from './useMontage';

// Remotion n'entre dans le navigateur qu'à l'ouverture d'un montage.
const PanneauMontage = lazy(() => import('./PanneauMontage'));

/**
 * Le montage d'une vidéo directe (SPEC §12.7) : face caméra de bout en bout,
 * pas de scène. Le texte de référence est le script quand il y en a un — les
 * sections d'un Script Reel, chacune un passage caméra —, sinon la
 * transcription de la prise : c'est elle qui dit alors quelles phrases ont été
 * recommencées.
 */

/** Une vidéo directe n'a pas de visuel : la même fonction à chaque rendu, pour ne rien recalculer. */
const AUCUN_VISUEL = () => ({});

export interface MontageDirectProps {
    /** Le brouillon, déjà lu (JSON). */
    brouillon: unknown;
    contentId: string;
}

export const MontageDirect: React.FC<MontageDirectProps> = ({ brouillon, contentId }) => {
    const montage = useMontage(contentId);
    const transcription = montage.etat?.prises.find(p => p.role === 'principale' && p.transcription)?.transcription;
    const script = useMemo(() => montageDuBrouillon(brouillon), [brouillon]);
    const sansScript = !script?.sequences.length;
    const data = useMemo<ReelExplique>(() => {
        if (!sansScript && script) return script;
        if (transcription) return scriptDepuisLaTranscription(transcription.mots, transcription.enveloppe);
        return { format: 'Script Reel', sequences: [] };
    }, [sansScript, script, transcription]);

    return (
        <Suspense fallback={<Patience titre="Chargement du montage" />}>
            <PanneauMontage data={data} contentId={contentId} montage={montage} visuelsDeLaScene={AUCUN_VISUEL} sansScript={sansScript} />
        </Suspense>
    );
};

export default MontageDirect;
