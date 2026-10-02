import React from 'react';
import { Camera, Clapperboard, Megaphone, TriangleAlert, ImageIcon } from 'lucide-react';
import {
    verifierReelExplique, dureeEstimee, compterMots, positionsDesReperes, motsSitues, motsNormalises,
    type ReelExplique, type SequenceReel,
} from '@luminose/editorial';
import { Etiquette } from '../../ui';
import { CarrouselLegende, t } from './shared';
import { SceneLuminose } from '../../Video/SceneLuminose';

/**
 * Le storyboard d'un Reel expliqué (SPEC §12, étape V1) : ce qui se dit, et à
 * côté, ce que l'écran montre. C'est le document de tournage — la voix se lit
 * de haut en bas, et chaque repère y est souligné du numéro de l'élément qu'il
 * fait apparaître.
 */

interface Marque { debut: number; fin: number; numeros: number[] }

/** Les empans de la voix qui font apparaître un élément — calculés comme le contrôle les calcule. */
function marquesDesReperes(sequence: SequenceReel): Marque[] {
    const mots = motsSitues(sequence.voix);
    const positions = positionsDesReperes(sequence);
    const brutes = (sequence.elements ?? []).flatMap((element, j) => {
        const position = positions[j];
        if (position === null) return [];
        const premier = mots[position];
        const dernier = mots[position + motsNormalises(element.apparait_sur).length - 1];
        return premier && dernier ? [{ debut: premier.debut, fin: dernier.fin, numeros: [j + 1] }] : [];
    }).sort((a, b) => a.debut - b.debut);

    // Deux éléments sur les mêmes mots (une liaison et la carte qu'elle annonce) :
    // un seul soulignement, deux numéros.
    const fusionnees: Marque[] = [];
    for (const m of brutes) {
        const precedente = fusionnees[fusionnees.length - 1];
        if (precedente && m.debut < precedente.fin) {
            precedente.fin = Math.max(precedente.fin, m.fin);
            precedente.numeros.push(...m.numeros);
        } else fusionnees.push({ ...m });
    }
    return fusionnees;
}

const VoixAvecReperes: React.FC<{ sequence: SequenceReel }> = ({ sequence }) => {
    const voix = sequence.voix ?? '';
    const morceaux: React.ReactNode[] = [];
    let curseur = 0;
    marquesDesReperes(sequence).forEach((m, i) => {
        if (m.debut > curseur) morceaux.push(voix.slice(curseur, m.debut));
        morceaux.push(
            <span key={i} className="underline decoration-2 underline-offset-4 decoration-brand-main/40 dark:decoration-dark-text/50">
                {voix.slice(m.debut, m.fin)}
                <sup className="ml-1 text-micro font-bold text-brand-main/70 dark:text-dark-text/70">{m.numeros.join(',')}</sup>
            </span>
        );
        curseur = m.fin;
    });
    if (curseur < voix.length) morceaux.push(voix.slice(curseur));
    return <p className="text-sm leading-relaxed text-brand-main dark:text-dark-text whitespace-pre-wrap">{morceaux}</p>;
};

const Intention: React.FC<{ texte?: string | null }> = ({ texte }) =>
    t(texte) ? <p className="text-xs italic text-brand-main/60 dark:text-dark-text/60">{t(texte)}</p> : null;

const SequenceCamera: React.FC<{ sequence: SequenceReel; numero: number }> = ({ sequence, numero }) => (
    <div className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface p-4 space-y-2">
        <Etiquette forme="entete" avecIcone>
            <Camera /> {numero}. Face caméra{t(sequence.role) ? ` · ${t(sequence.role)}` : ''}
        </Etiquette>
        <p className="text-sm leading-relaxed text-brand-main dark:text-dark-text whitespace-pre-wrap">{t(sequence.voix)}</p>
        <Intention texte={sequence.intention} />
    </div>
);

const SequenceScene: React.FC<{ sequence: SequenceReel; numero: number }> = ({ sequence, numero }) => {
    const aProduire = (sequence.elements ?? [])
        .map((element, j) => ({ element, numero: j + 1 }))
        .filter(({ element }) => element.visuel?.description);
    const registre = sequence.registre === 'humour' ? 'humour' : sequence.registre === 'pedagogie' ? 'pédagogie' : null;
    return (
        <div className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg p-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-2 min-w-0">
                <Etiquette forme="entete" avecIcone>
                    <Clapperboard /> {numero}. Scène{t(sequence.role) ? ` · ${t(sequence.role)}` : ''}{registre ? ` · ${registre}` : ''}
                </Etiquette>
                <VoixAvecReperes sequence={sequence} />
                <Intention texte={sequence.intention} />
                {aProduire.length > 0 && (
                    <div className="space-y-1 pt-1">
                        <Etiquette avecIcone><ImageIcon /> À produire</Etiquette>
                        {aProduire.map(({ element, numero: n }) => (
                            <p key={n} className="text-xs text-brand-main dark:text-dark-text">
                                <span className="font-bold">{n}.</span>{' '}
                                {element.visuel!.nature === 'schema' ? 'Schéma' : 'Illustration'} — {t(element.visuel!.description)}
                            </p>
                        ))}
                    </div>
                )}
            </div>
            <div className="justify-self-center">
                <SceneLuminose sequence={sequence} largeur={216} />
            </div>
        </div>
    );
};

export const StoryboardRenderer: React.FC<{ data: ReelExplique }> = ({ data }) => {
    const problemes = verifierReelExplique(data);
    const sequences = data.sequences ?? [];
    const mots = sequences.reduce((total, s) => total + compterMots(s.voix), 0);
    const nbScenes = sequences.filter(s => s.plan === 'scene').length;

    return (
        <div className="p-6 space-y-4">
            <p className="text-xs text-brand-main/60 dark:text-dark-text/60">
                Durée estimée ≈ {dureeEstimee(data)} s · {mots} mots · {nbScenes} scène{nbScenes > 1 ? 's' : ''} — au débit de 150 mots par minute ; la prise donnera le vrai.
            </p>

            {problemes.length > 0 && (
                <div className="rounded-xl border border-alerte/30 bg-alerte/10 p-4 space-y-2">
                    <Etiquette ton="alerte" avecIcone><TriangleAlert /> À corriger avant de tourner</Etiquette>
                    <ul className="space-y-1">
                        {problemes.map((p, i) => (
                            <li key={i} className="text-xs text-alerte"><span className="font-bold">{p.ou}</span> — {p.probleme}</li>
                        ))}
                    </ul>
                </div>
            )}

            {sequences.map((sequence, i) => sequence.plan === 'scene'
                ? <SequenceScene key={i} sequence={sequence} numero={i + 1} />
                : <SequenceCamera key={i} sequence={sequence} numero={i + 1} />
            )}

            {data.accroche_pub?.voix && (
                <div className="rounded-xl border border-dashed border-brand-border dark:border-dark-sec-border p-4 space-y-2">
                    <Etiquette forme="entete" avecIcone><Megaphone /> Seconde accroche · publicité</Etiquette>
                    <p className="text-sm leading-relaxed text-brand-main dark:text-dark-text whitespace-pre-wrap">{t(data.accroche_pub.voix)}</p>
                    <Intention texte={data.accroche_pub.intention} />
                    <p className="text-xs text-brand-main/60 dark:text-dark-text/60">À tourner dans la foulée : elle remplace la séquence 1 dans la variante publicitaire.</p>
                </div>
            )}

            <CarrouselLegende legende={data.legende as any} />
        </div>
    );
};

export default StoryboardRenderer;
