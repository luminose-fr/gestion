import React, { Suspense, lazy, useMemo } from 'react';
import { montageDuBrouillon, parseBodyJson, scriptDepuisLaTranscription, type ReelExplique } from '@luminose/editorial';
import { Patience } from '../Feedback';
import { useMontage } from '../Video/useMontage';
import { useVisuelsReel } from '../Video/useVisuelsReel';
import type { OngletStudio } from '../Video/PanneauMontage';

// Remotion n'entre dans le navigateur qu'à l'ouverture d'un studio : jamais dans le paquet principal.
const PanneauMontage = lazy(() => import('../Video/PanneauMontage'));

/**
 * Le studio (SPEC §13.11) : l'étape Montage d'une vidéo. Il lit le texte de
 * référence — le script, ou, pour une vidéo directe sans script, la
 * transcription de la prise (§12.7) — et confie le reste au panneau de montage.
 */
export interface StudioProps {
    contentId: string;
    /** Le brouillon, tel qu'en base. */
    draft: string;
    format: string | null;
    dernierExport?: { format: string; version: string; le: number } | null;
    ongletInitial?: OngletStudio;
}

export const Studio: React.FC<StudioProps> = ({ contentId, draft, format, dernierExport, ongletInitial }) => {
    const montage = useMontage(contentId);
    const script = useMemo(() => montageDuBrouillon(parseBodyJson(draft), format), [draft, format]);
    const sansScript = !script?.sequences.length;
    const transcription = montage.etat?.prises.find(p => p.role === 'principale' && p.transcription)?.transcription;
    const data = useMemo<ReelExplique>(() => {
        if (!sansScript && script) return script;
        if (transcription) return scriptDepuisLaTranscription(transcription.mots, transcription.enveloppe);
        return { format: 'Script Reel', sequences: [] };
    }, [sansScript, script, transcription]);
    const visuels = useVisuelsReel(contentId, data, montage);

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            {montage.erreur && <p className="px-7 py-2 text-xs text-erreur">Le montage n'a pas pu être lu : {montage.erreur}</p>}
            <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Patience titre="Chargement du studio" /></div>}>
                <PanneauMontage data={data} contentId={contentId} montage={montage} visuels={visuels}
                    sansScript={sansScript} dernierExport={dernierExport} ongletInitial={ongletInitial} />
            </Suspense>
        </div>
    );
};

export default Studio;
