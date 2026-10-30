import React from 'react';
import { Clock, TriangleAlert } from 'lucide-react';
import { visuelsAProduire, type MomentFige, type ReelExplique } from '@luminose/editorial';
import { Bouton, Etiquette } from '../ui';
import { VisuelsAFournir } from './VisuelsAFournir';
import type { VisuelsReel } from './useVisuelsReel';

/**
 * Ce qui reste à faire avant d'exporter, en tête du studio (v2.32) : les
 * visuels à fournir, les moments où rien ne bouge (§12.5.3), les écrans dont
 * les mots n'ont pas été dits. Ils étaient répartis entre les onglets Scènes et
 * Rythme, et une pastille sur chaque onglet disait qu'il fallait aller voir ;
 * l'encadré dit quoi faire, là où on le fait.
 *
 * Sans rien à signaler ni visuel à gérer, il ne s'affiche pas.
 */

const secondes = (s: number) => `${s.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`;
const minutes = (s: number) => {
    const t = Math.max(0, Math.round(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export interface AvantDExporterProps {
    data: ReelExplique;
    /** Une vidéo directe (§12.7) n'a ni visuel, ni écran à vérifier : seul le rythme compte. */
    animations: boolean;
    visuels: VisuelsReel | null;
    /** Les images décrites qui ne sont pas encore déposées. */
    manquent: number;
    /** Sur la prise calée seulement : au débit estimé, c'est une affaire d'écriture. */
    figes: MomentFige[];
    estimes: number;
    onAller: (secondesDansLaVideo: number) => void;
}

export const AvantDExporter: React.FC<AvantDExporterProps> = ({ data, animations, visuels, manquent, figes, estimes, onAller }) => {
    const aVerifier = animations ? estimes : 0;
    const aRevoir = manquent > 0 || figes.length > 0 || aVerifier > 0;
    const desVisuels = animations && !!visuels && visuelsAProduire(data) > 0;
    if (!aRevoir && !desVisuels) return null;
    const sequences = data.sequences ?? [];
    return (
        <section className={`rounded-xl border p-4 space-y-3 ${aRevoir ? 'border-alerte/30' : 'border-brand-border dark:border-dark-sec-border'}`}>
            <Etiquette forme="entete" ton={aRevoir ? 'alerte' : 'neutre'}>{aRevoir ? 'Avant d’exporter' : 'Visuels'}</Etiquette>
            {desVisuels && visuels.indisponible && (
                <p className="text-xs text-alerte">Le stockage Cloudflare (R2) n'est pas configuré sur le Worker : les visuels ne peuvent pas être déposés.</p>
            )}
            {desVisuels && <VisuelsAFournir reel={data} visuels={visuels} deposable={!visuels.indisponible} />}
            {figes.map(f => {
                const role = sequences[f.sequence]?.role;
                return (
                    <div key={f.debut} className="flex items-start gap-3 text-xs text-brand-main dark:text-dark-text">
                        <Clock className="size-4 shrink-0 text-alerte" />
                        <p className="min-w-0 flex-1">
                            <span className="font-bold">Rien ne bouge pendant {secondes(f.fin - f.debut)}</span>, à {minutes(f.debut)} — séquence {f.sequence + 1}{role ? ` · ${role}` : ''}.
                            {' '}{animations
                                ? 'Une coupe, ou un écran qui arrive plus tôt, le remet en mouvement ; sinon, un coup de poing à l’écriture.'
                                : 'Une phrase coupée le remet en mouvement.'}
                        </p>
                        <Bouton taille="petit" intention="secondaire" title="Voir ce moment dans l’aperçu" onClick={() => onAller(f.debut)}>Voir</Bouton>
                    </div>
                );
            })}
            {aVerifier > 0 && (
                <div className="flex items-start gap-3 text-xs text-brand-main dark:text-dark-text">
                    <TriangleAlert className="size-4 shrink-0 text-alerte" />
                    <p className="min-w-0 flex-1">
                        <span className="font-bold">{aVerifier === 1 ? '1 écran à vérifier' : `${aVerifier} écrans à vérifier`}</span> : les mots
                        qui devaient {aVerifier === 1 ? 'le' : 'les'} faire apparaître n’ont pas été dits tels quels.
                        {aVerifier === 1 ? ' Son étiquette est' : ' Leurs étiquettes sont'} en orange dans le texte.
                    </p>
                </div>
            )}
        </section>
    );
};

export default AvantDExporter;
