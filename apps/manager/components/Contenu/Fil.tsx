import React, { useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { jourCourt, type BulleDuFil, type ElementDuFil, type RoleDuFil } from '@luminose/editorial';
import { Bouton, Champ } from '../ui';
import { EnCours } from '../Feedback';
import { renderMdText } from '../ContentEditor/renderers/shared';

/**
 * Le fil d'un contenu (SPEC §13.10) : une conversation avec ses rôles, à côté
 * de ce qu'elle produit. Les voix de l'IA parlent à gauche, Florent à droite ;
 * le dernier message est en bas, comme dans une messagerie, et c'est lui qui
 * dit où en est le contenu.
 */

export interface ZoneOuverture {
    type: 'ouverture';
    onOuvrirAtelier: () => void;
    onRedigerSansAtelier: () => void;
    /** Seulement si l'idée n'est pas encore préparée. */
    onDemanderAnalyse?: () => void;
    occupe?: boolean;
}

export interface ZoneComposeur {
    type: 'composeur';
    destinataire: 'coach' | 'redacteur';
    onEnvoyer: (texte: string) => void;
    /** Au plus deux réponses rapides : une suggestion du Coach, ou « Go ». */
    reponses?: Array<{ libelle: string; onChoisir: () => void }>;
    /** Changer de destinataire : rouvrir l'atelier, ou revenir au Rédacteur. */
    autre?: { libelle: string; onChoisir: () => void };
    desactive?: boolean;
    erreur?: string | null;
}

export interface FilProps {
    elements: ElementDuFil[];
    /** Un rôle travaille : sa bulle d'attente ferme le fil. */
    attente?: RoleDuFil | null;
    zone: ZoneOuverture | ZoneComposeur | null;
    onAppliquer?: (corrections: string) => void;
    onCorrigerLeFormat?: (points: string[]) => void;
    onRevenir?: () => void;
    occupe?: boolean;
    /** Le volet du studio porte sa propre fermeture. */
    entete?: React.ReactNode;
}

const RAYON_IA = 'rounded-[4px_14px_14px_14px]';
const RAYON_VOUS = 'rounded-[14px_4px_14px_14px]';

const Bulle: React.FC<{
    b: BulleDuFil;
    ignoree: boolean;
    onIgnorer: () => void;
    onAppliquer?: (corrections: string) => void;
    onCorrigerLeFormat?: (points: string[]) => void;
    onRevenir?: () => void;
    occupe?: boolean;
}> = ({ b, ignoree, onIgnorer, onAppliquer, onCorrigerLeFormat, onRevenir, occupe }) => {
    if (b.de === 'vous') {
        return (
            <div className="flex flex-col items-end gap-1">
                <span className="text-xs font-bold text-brand-main/70 dark:text-dark-text/70">Vous · {jourCourt(b.le)}</span>
                <div className={`max-w-[85%] ${RAYON_VOUS} bg-brand-main dark:bg-white px-4 py-2 text-sm leading-[22px] text-white dark:text-brand-main whitespace-pre-wrap`}>
                    {b.texte}
                </div>
            </div>
        );
    }
    const bordure = b.ton === 'succes' ? 'border-succes/30' : b.ton === 'alerte' ? 'border-alerte/30' : 'border-brand-border dark:border-dark-sec-border';
    const sens = b.ton === 'succes' ? 'text-succes' : 'text-alerte';
    const peutAppliquer = !ignoree && !!b.corrections && !!onAppliquer;
    const peutCorriger = !ignoree && !!b.controle && !!onCorrigerLeFormat && !!b.points?.length;
    return (
        <div className="flex flex-col items-start gap-1">
            <span className="text-xs font-bold text-brand-main/70 dark:text-dark-text/70">{b.role} · {jourCourt(b.le)}</span>
            <div className={`max-w-[88%] ${RAYON_IA} border ${bordure} bg-white dark:bg-dark-surface px-4 py-2 text-sm leading-[22px] text-brand-main dark:text-dark-text space-y-2`}>
                {b.verdict && <p className={`font-bold ${sens}`}>{b.verdict}.</p>}
                {b.texte && <div className="whitespace-pre-wrap">{b.role === 'Coach' ? renderMdText(b.texte) : b.texte}</div>}
                {b.points && b.points.length > 0 && (
                    <ul className="list-disc pl-4 space-y-1">
                        {b.points.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                )}
                {(peutAppliquer || peutCorriger) && (
                    <div className="flex items-center gap-3 pt-1">
                        <Bouton taille="petit" intention="principale" disabled={occupe}
                            onClick={() => (peutAppliquer ? onAppliquer!(b.corrections!) : onCorrigerLeFormat!(b.points!))}>
                            {peutCorriger ? 'Corriger' : b.points && b.points.length === 2 ? 'Appliquer les deux' : 'Appliquer les corrections'}
                        </Bouton>
                        <Bouton taille="petit" intention="discrete" onClick={onIgnorer}>Ignorer</Bouton>
                    </div>
                )}
                {/* « 16 oct. » porte déjà son point ; « 3 mai », non. */}
                {b.appliqueeLe && <p className="text-xs text-brand-main/60 dark:text-dark-text/60">Appliquées le {jourCourt(b.appliqueeLe).replace(/\.?$/, '.')}</p>}
                {b.revenirPossible && onRevenir && (
                    <button type="button" onClick={onRevenir} disabled={occupe} className="text-xs underline hover:no-underline text-brand-main/70 dark:text-dark-text/70 disabled:opacity-40">
                        Revenir à la version précédente
                    </button>
                )}
            </div>
        </div>
    );
};

const Attente: React.FC<{ role: RoleDuFil }> = ({ role }) => (
    <div className="flex flex-col items-start gap-1" aria-live="polite">
        <span className="text-xs font-bold text-brand-main/70 dark:text-dark-text/70">{role}</span>
        <div className={`${RAYON_IA} border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface px-4 py-2 text-sm italic text-brand-main/70 dark:text-dark-text/70`}>
            réfléchit…
        </div>
    </div>
);

const Composeur: React.FC<{ zone: ZoneComposeur }> = ({ zone }) => {
    const [texte, setTexte] = useState('');
    const envoyer = () => {
        if (!texte.trim() || zone.desactive) return;
        zone.onEnvoyer(texte.trim());
        setTexte('');
    };
    return (
        <div className="space-y-2">
            <p className="text-xs text-brand-main/70 dark:text-dark-text/70">
                {zone.destinataire === 'coach'
                    ? <><span className="font-bold">Au Coach</span> · « Go » valide la direction</>
                    : <><span className="font-bold">Au Rédacteur</span> · un message = un ajustement</>}
                {zone.autre && (
                    <> · <button type="button" onClick={zone.autre.onChoisir} className="underline hover:no-underline">{zone.autre.libelle}</button></>
                )}
            </p>
            {zone.reponses && zone.reponses.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {zone.reponses.map(r => (
                        <button key={r.libelle} type="button" onClick={r.onChoisir} disabled={zone.desactive}
                            className="h-9 px-3 rounded-full border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface text-xs font-semibold text-brand-main dark:text-dark-text hover:border-brand-main/40 transition-colors disabled:opacity-40 truncate max-w-full">
                            {r.libelle}
                        </button>
                    ))}
                </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); envoyer(); }} className="flex items-center gap-2">
                <Champ
                    taille="grand"
                    value={texte}
                    onChange={(e) => setTexte((e.target as HTMLInputElement).value)}
                    disabled={zone.desactive}
                    aria-label={zone.destinataire === 'coach' ? 'Message au Coach' : 'Ajustement pour le Rédacteur'}
                    placeholder={zone.destinataire === 'coach' ? 'Votre réponse au Coach…' : 'Ce que le Rédacteur doit changer, et rien d’autre…'}
                />
                <Bouton type="submit" taille="grand" intention="principale" disabled={!texte.trim() || zone.desactive}>
                    <Send /> Envoyer
                </Bouton>
            </form>
            {zone.erreur && <p className="text-xs text-erreur">{zone.erreur}</p>}
        </div>
    );
};

export const Fil: React.FC<FilProps> = ({ elements, attente, zone, onAppliquer, onCorrigerLeFormat, onRevenir, occupe, entete }) => {
    const [deplie, setDeplie] = useState(false);
    const [ignorees, setIgnorees] = useState<Set<string>>(new Set());
    const ignorer = (id: string) => setIgnorees(prev => new Set(prev).add(id));

    const bulle = (b: BulleDuFil) => (
        <Bulle key={b.id} b={b} ignoree={ignorees.has(b.id)} onIgnorer={() => ignorer(b.id)}
            onAppliquer={onAppliquer} onCorrigerLeFormat={onCorrigerLeFormat} onRevenir={onRevenir} occupe={occupe} />
    );

    return (
        <div className="h-full min-h-0 flex flex-col bg-fil dark:bg-dark-bg">
            {entete ?? (
                <div className="h-[60px] shrink-0 flex items-center gap-2 px-5 border-b border-brand-border dark:border-dark-sec-border">
                    <MessageCircle className="w-4 h-4 text-brand-main dark:text-dark-text" />
                    <span className="text-sm font-bold text-brand-main dark:text-white">Le fil</span>
                    <span className="text-xs text-brand-main/60 dark:text-dark-text/60">ce qui s’est dit et fait</span>
                </div>
            )}
            {/* Ancré en bas : le fil s'ouvre sur ses derniers messages. */}
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col-reverse px-5 py-4">
                <div className="space-y-4">
                    {elements.length === 0 && !attente && (
                        <p className="text-xs text-center text-brand-main/60 dark:text-dark-text/60">Rien ne s’est encore dit sur ce contenu.</p>
                    )}
                    {elements.map(e => e.type === 'atelier' ? (
                        <div key={e.id} className="space-y-4">
                            <div className="h-10 flex items-center gap-3 px-4 rounded-lg border border-dashed border-brand-border dark:border-dark-sec-border text-xs text-brand-main/70 dark:text-dark-text/70">
                                <span className="flex-1">Atelier · {e.messages} message{e.messages > 1 ? 's' : ''} · validé</span>
                                <button type="button" onClick={() => setDeplie(d => !d)} className="underline hover:no-underline">{deplie ? 'Replier' : 'Déplier'}</button>
                            </div>
                            {deplie && e.bulles.map(bulle)}
                        </div>
                    ) : bulle(e))}
                    {attente && <Attente role={attente} />}
                </div>
            </div>
            {zone && (
                <div className="shrink-0 px-5 py-4 border-t border-brand-border dark:border-dark-sec-border">
                    {zone.type === 'ouverture' ? (
                        <div className="space-y-3">
                            <p className="text-xs text-brand-main/70 dark:text-dark-text/70">
                                Le Coach vous interroge pour trouver l’angle ; « Go » passe la main au Rédacteur.
                            </p>
                            <Bouton taille="grand" intention="principale" posee className="w-full h-11" disabled={zone.occupe} onClick={zone.onOuvrirAtelier}>
                                {zone.occupe ? <EnCours label="Ouverture…" /> : 'Ouvrir l’atelier avec le Coach'}
                            </Bouton>
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                                <Bouton taille="petit" intention="discrete" disabled={zone.occupe} onClick={zone.onRedigerSansAtelier}>Rédiger sans atelier</Bouton>
                                {zone.onDemanderAnalyse && (
                                    <Bouton taille="petit" intention="discrete" disabled={zone.occupe} onClick={zone.onDemanderAnalyse}>Demander l’ouverture à l’Analyste</Bouton>
                                )}
                            </div>
                        </div>
                    ) : <Composeur zone={zone} />}
                </div>
            )}
        </div>
    );
};

export default Fil;
