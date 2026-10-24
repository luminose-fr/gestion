import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Crosshair, RotateCcw, Scissors } from 'lucide-react';
import { estCoupee, type ChoixDesCoupes, type CoupeProposee, type MotifCoupe } from '@luminose/editorial';
import { Bouton, Etiquette } from '../ui';

/**
 * Le dérushage d'une prise (SPEC §12.5.2) : ce qui en a été coupé, et de quoi
 * le rétablir.
 *
 * Les reprises et les improvisations se listent une à une, avec ce qui y a
 * été dit : c'est là qu'une coupe peut avoir tort. Les silences, nombreux et
 * sans contenu, se résument en une ligne qu'on déplie au besoin.
 */

const secondes = (s: number) => `${s.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;

const MOTIF: Record<MotifCoupe, string> = {
    silence: 'Silence',
    reprise: 'Reprise',
    'hors-script': 'Hors script',
};

export interface CoupesPriseProps {
    titre: string;
    coupes: CoupeProposee[];
    choix: ChoixDesCoupes;
    onTrancher: (decisions: Array<{ coupe: CoupeProposee; coupee: boolean }>) => void;
    /** Où la coupe tombe dans la vidéo, ou `null` quand la version affichée ne montre pas cette prise. */
    situer: (coupe: CoupeProposee) => number | null;
    onAller: (secondesDansLaVideo: number) => void;
}

export const CoupesPrise: React.FC<CoupesPriseProps> = ({ titre, coupes, choix, onTrancher, situer, onAller }) => {
    const [silencesOuverts, setSilencesOuverts] = useState(false);
    const silences = coupes.filter(c => c.motif === 'silence');
    const paroles = coupes.filter(c => c.motif !== 'silence');
    const retire = coupes.filter(c => estCoupee(c, choix)).reduce((s, c) => s + c.fin - c.debut, 0);
    const silencesCoupes = silences.filter(c => estCoupee(c, choix));

    const ligne = (coupe: CoupeProposee) => {
        const coupee = estCoupee(coupe, choix);
        const instant = situer(coupe);
        return (
            <div key={coupe.cle} className="flex items-center gap-2">
                <Bouton
                    taille="petit"
                    intention="discrete"
                    disabled={instant === null}
                    title="Voir ce moment dans l'aperçu"
                    // Une seconde avant : on voit la phrase arriver au raccord.
                    onClick={() => instant !== null && onAller(Math.max(0, instant - 1))}
                >
                    <Crosshair /> {instant === null ? '—' : secondes(instant)}
                </Bouton>
                {coupe.motif !== 'silence' && (
                    <Etiquette as="span" forme="pastille" ton={coupe.motif === 'reprise' ? 'neutre' : 'alerte'}>
                        {MOTIF[coupe.motif]}
                    </Etiquette>
                )}
                <span className={`min-w-0 flex-1 truncate text-xs ${coupee ? 'text-brand-main/60 dark:text-dark-text/60 line-through' : 'text-brand-main dark:text-dark-text'}`}>
                    {coupe.texte ? `« ${coupe.texte} »` : `${secondes(coupe.fin - coupe.debut)} de silence`}
                </span>
                {coupe.texte && (
                    <span className="text-xs tabular-nums text-brand-main/70 dark:text-dark-text/70">{secondes(coupe.fin - coupe.debut)}</span>
                )}
                <Bouton taille="petit" intention="secondaire" onClick={() => onTrancher([{ coupe, coupee: !coupee }])}>
                    {coupee ? <><RotateCcw /> Rétablir</> : <><Scissors /> Couper</>}
                </Bouton>
            </div>
        );
    };

    return (
        <div className="space-y-2">
            <Etiquette avecIcone><Scissors /> {titre}</Etiquette>
            {coupes.length === 0 ? (
                <p className="text-xs text-brand-main/60 dark:text-dark-text/60">Rien à couper : la prise est dite d'un trait.</p>
            ) : (
                <>
                    <p className="text-xs text-brand-main/60 dark:text-dark-text/60">
                        {secondes(retire)} retirées. Les silences et les phrases reprises sont coupés d'office ;
                        ce qui sort du script se propose seulement. Chaque coupe se rétablit.
                    </p>
                    {paroles.map(ligne)}
                    {silences.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Bouton
                                    taille="petit"
                                    intention="discrete"
                                    aria-expanded={silencesOuverts}
                                    onClick={() => setSilencesOuverts(o => !o)}
                                >
                                    {silencesOuverts ? <ChevronDown /> : <ChevronRight />}
                                    {silences.length} silence{silences.length > 1 ? 's' : ''}
                                </Bouton>
                                <span className="min-w-0 flex-1 truncate text-xs text-brand-main/70 dark:text-dark-text/70">
                                    {silencesCoupes.length === silences.length
                                        ? 'tous raccourcis'
                                        : `${silencesCoupes.length} raccourci${silencesCoupes.length > 1 ? 's' : ''} sur ${silences.length}`}
                                </span>
                                <Bouton
                                    taille="petit"
                                    intention="secondaire"
                                    onClick={() => {
                                        const tous = silencesCoupes.length < silences.length;
                                        onTrancher(silences.map(coupe => ({ coupe, coupee: tous })));
                                    }}
                                >
                                    {silencesCoupes.length < silences.length
                                        ? <><Scissors /> Tout raccourcir</>
                                        : <><RotateCcw /> Tout rétablir</>}
                                </Bouton>
                            </div>
                            {silencesOuverts && silences.map(ligne)}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default CoupesPrise;
