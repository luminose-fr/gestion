import React from 'react';
import { Crosshair, Minus, Plus, RotateCcw } from 'lucide-react';
import { texteAffiche, type MinutageReel, type PlanDeMontage, type ReelExplique } from '@luminose/editorial';
import { Bouton, Etiquette } from '../ui';

/**
 * Les repères de la prise, un par élément de scène, corrigeables au dixième de
 * seconde (SPEC §12.5). Le calage trouve presque tout ; ce qu'il rate — un mot
 * dit autrement, une phrase reprise —, Florent le voit dans l'aperçu et le
 * corrige ici. La correction est gardée avec la prise et survit à une nouvelle
 * transcription.
 */

const PAS = 0.1;

const secondes = (s: number) => `${s.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;

export interface ReperesPriseProps {
    data: ReelExplique;
    /** Le minutage dans le temps de la prise, sans les corrections. */
    calage: MinutageReel;
    /** Le plan affiché : c'est dans son temps qu'on va voir un repère. */
    plan: PlanDeMontage;
    reperes: Record<string, number>;
    onCorriger: (sequence: number, element: number, secondes: number | null) => void;
    onAller: (secondesDansLaVideo: number) => void;
}

export const ReperesPrise: React.FC<ReperesPriseProps> = ({ data, calage, plan, reperes, onCorriger, onAller }) => (
    <div className="space-y-2">
        <Etiquette>Repères — l'instant où chaque élément apparaît dans la prise</Etiquette>
        {(data.sequences ?? []).map((sequence, i) => sequence.plan !== 'scene' ? null : (sequence.elements ?? []).map((element, j) => {
            const m = calage.sequences[i];
            const cle = `${i}:${j}`;
            const corrige = reperes[cle];
            const calcule = m ? m.debut + (m.apparitions[j] ?? m.fin - m.debut) : 0;
            const actuel = corrige ?? calcule;
            const sortie = plan.minutage.sequences[i];
            const libelle = texteAffiche(element.texte)
                || (element.visuel ? (element.visuel.nature === 'schema' ? 'Schéma' : 'Illustration') : element.type);
            return (
                <div key={cle} className="flex items-center gap-2">
                    <Bouton
                        taille="petit"
                        intention="discrete"
                        title="Voir ce moment dans l'aperçu"
                        onClick={() => sortie && onAller(sortie.debut + (sortie.apparitions[j] ?? 0))}
                    >
                        <Crosshair /> {i + 1}.{j + 1}
                    </Bouton>
                    <span className="min-w-0 flex-1 truncate text-xs text-brand-main dark:text-dark-text">{libelle}</span>
                    <span className={`text-xs tabular-nums ${corrige !== undefined ? 'font-bold text-brand-main dark:text-white' : 'text-brand-main/70 dark:text-dark-text/70'}`}>
                        {secondes(actuel)}
                    </span>
                    <Bouton taille="petit" intention="secondaire" title="Un dixième plus tôt" onClick={() => onCorriger(i, j, actuel - PAS)}>
                        <Minus />
                    </Bouton>
                    <Bouton taille="petit" intention="secondaire" title="Un dixième plus tard" onClick={() => onCorriger(i, j, actuel + PAS)}>
                        <Plus />
                    </Bouton>
                    {corrige !== undefined && (
                        <Bouton taille="petit" intention="discrete" title="Rendre le repère au calage" onClick={() => onCorriger(i, j, null)}>
                            <RotateCcw />
                        </Bouton>
                    )}
                </div>
            );
        }))}
    </div>
);

export default ReperesPrise;
