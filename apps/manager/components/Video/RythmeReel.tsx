import React from 'react';
import { Activity, Crosshair } from 'lucide-react';
import { FIGE_MAX, type MomentFige, type ReelExplique } from '@luminose/editorial';
import { Bouton, Etiquette } from '../ui';

/**
 * Le rythme d'un Reel expliqué (SPEC §12.5.3) : les moments où rien ne change
 * à l'écran plus de cinq secondes. Avant le tournage, au débit estimé, c'est
 * une affaire d'écriture ; après, sur la prise, c'est ce qui sortira.
 */

const secondes = (s: number) => `${s.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;

export interface RythmeReelProps {
    data: ReelExplique;
    figes: MomentFige[];
    /** Sur la prise calée, ou au débit estimé : le conseil n'est pas le même. */
    surLaPrise: boolean;
    /** Une vidéo directe (§12.7) n'a ni carte ni coup de poing à ajouter : le conseil change. */
    animations?: boolean;
    onAller: (secondesDansLaVideo: number) => void;
}

export const RythmeReel: React.FC<RythmeReelProps> = ({ data, figes, surLaPrise, animations = true, onAller }) => (
    <div className="space-y-2">
        <Etiquette avecIcone><Activity /> Rythme</Etiquette>
        {figes.length === 0 ? (
            <p className="text-xs text-brand-main/60 dark:text-dark-text/60">
                L'image change au moins toutes les {FIGE_MAX} secondes{surLaPrise ? '' : ', au débit estimé'}.
            </p>
        ) : (
            <>
                <p className="text-xs text-alerte">
                    {figes.length === 1 ? 'Un moment' : `${figes.length} moments`} où rien ne bouge plus de {FIGE_MAX} secondes.
                    {!animations
                        ? ' Une phrase plus courte au tournage, ou un passage coupé dans le montage par le texte, le remet en mouvement.'
                        : surLaPrise
                            ? ' Un repère avancé, ou une coupe, peut suffire ; sinon, c\'est à l\'écriture : une carte de plus, un coup de poing.'
                            : ' Une carte de plus, un coup de poing, ou une phrase coupée en deux le remettent en mouvement.'}
                </p>
                {figes.map(f => {
                    const sequence = data.sequences?.[f.sequence];
                    const plan = sequence?.plan === 'scene' ? 'scène' : 'face caméra';
                    return (
                        <div key={f.debut} className="flex items-center gap-2">
                            <Bouton taille="petit" intention="discrete" title="Voir ce moment dans l'aperçu" onClick={() => onAller(f.debut)}>
                                <Crosshair /> {secondes(f.debut)}
                            </Bouton>
                            <span className="min-w-0 flex-1 truncate text-xs text-brand-main dark:text-dark-text">
                                {secondes(f.fin - f.debut)} sans changement — séquence {f.sequence + 1}, {plan}
                                {sequence?.role ? ` · ${sequence.role}` : ''}
                            </span>
                        </div>
                    );
                })}
            </>
        )}
    </div>
);

export default RythmeReel;
