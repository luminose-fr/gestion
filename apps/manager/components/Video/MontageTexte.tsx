import React, { useMemo, useState } from 'react';
import { Pause, RotateCcw, Scissors, X } from 'lucide-react';
import {
    estCoupee, estUneVraieVersion,
    type Calage, type ChoixDesCoupes, type CoupeProposee, type Intervalle,
} from '@luminose/editorial';
import { Bouton, Etiquette } from '../ui';

/**
 * Le montage par le texte (SPEC §12.5.5) : la prise se lit comme un texte, et
 * ce qui est coupé est barré.
 *
 * Décidé le 25/10/2026, après une vraie prise : sur une prise brouillonne,
 * l'automatique ne sera jamais parfait, et la liste des coupes qui précédait ne
 * laissait trancher que ce qu'elle proposait. Ici, n'importe quel passage se
 * coupe ou se rétablit, et une phrase dite plusieurs fois se reprend dans la
 * version qu'on préfère — en un clic, en voyant les mots.
 *
 * Un clic sur un mot amène l'aperçu sur lui ; Maj + clic étend la sélection.
 */

const secondes = (s: number) => `${s.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;

/** Au-delà d'une telle pause, le texte passe à la ligne : on y lit les tentatives successives. */
const PAUSE_DE_LIGNE = 1.2;

/** Un mot tel que Whisper l'a écrit, avec les jetons qui le composent. */
interface MotAffiche { texte: string; debut: number; fin: number; premier: number; dernier: number }

export interface MontageTexteProps {
    titre: string;
    calage: Calage;
    coupes: CoupeProposee[];
    appliquees: Intervalle[];
    /**
     * Ce que la vidéo montre de cette prise, en secondes de la prise. C'est lui
     * qui décide du barré : ce qui précède la première phrase ou suit la
     * dernière n'est dans aucune coupe, et n'est pas dans la vidéo non plus.
     * `null` quand la version affichée ne montre pas cette prise : on s'en tient
     * alors aux coupes.
     */
    gardes: Intervalle[] | null;
    choix: ChoixDesCoupes;
    /** Durée de la prise, et ce qu'il en reste dans la vidéo — `null` si cette prise n'est pas dans la version affichée. */
    dureePrise: number;
    dureeGardee: number | null;
    /** Où un instant de la prise tombe dans la vidéo, ou `null`. */
    situer: (t: number) => number | null;
    onAller: (secondesDansLaVideo: number) => void;
    onTrancher: (decisions: Array<{ coupe: CoupeProposee; coupee: boolean }>) => void;
    onTrancherPassage: (passage: Intervalle, coupe: boolean) => void;
    onChoisirVersion: (phrase: number, debut: number) => void;
    onReinitialiser: () => void;
}

export const MontageTexte: React.FC<MontageTexteProps> = ({
    titre, calage, coupes, appliquees, gardes, choix, dureePrise, dureeGardee, situer, onAller,
    onTrancher, onTrancherPassage, onChoisirVersion, onReinitialiser,
}) => {
    const [selection, setSelection] = useState<{ ancre: number; bout: number } | null>(null);
    const prononces = calage.prononces ?? [];

    // Les jetons regroupés en mots tels que Whisper les a écrits : « l'envoyer » est un mot à l'écran.
    const mots = useMemo<MotAffiche[]>(() => {
        const liste: MotAffiche[] = [];
        prononces.forEach((p, k) => {
            const dernier = liste[liste.length - 1];
            if (p.ecrit || !dernier) liste.push({ texte: p.ecrit, debut: p.debut, fin: p.fin, premier: k, dernier: k });
            else { dernier.fin = p.fin; dernier.dernier = k; }
        });
        return liste;
    }, [prononces]);

    const estCoupe = (m: MotAffiche) => {
        const milieu = (m.debut + m.fin) / 2;
        return gardes
            ? !gardes.some(g => milieu > g.debut && milieu < g.fin)
            : appliquees.some(c => milieu > c.debut && milieu < c.fin);
    };

    // Ce qui s'affiche avant chaque mot : un silence proposé, une marque de version.
    const silenceAvant = useMemo(() => {
        const avant = new Map<number, CoupeProposee>();
        for (const c of coupes.filter(x => x.motif === 'silence')) {
            const i = mots.findIndex(m => m.debut >= c.fin - 0.01);
            if (i >= 0) avant.set(i, c);
        }
        return avant;
    }, [coupes, mots]);

    const versionAvant = useMemo(() => {
        const avant = new Map<number, { phrase: number; retenue: boolean; debut: number }>();
        calage.phrases?.forEach((c, s) => {
            const vraies = c.versions.map((v, k) => ({ v, k })).filter(({ v, k }) => k === c.retenue || estUneVraieVersion(v));
            if (vraies.length < 2) return;
            for (const { v, k } of vraies) {
                const i = mots.findIndex(m => m.premier <= v.debut && m.dernier >= v.debut);
                if (i >= 0) avant.set(i, { phrase: s, retenue: k === c.retenue, debut: prononces[v.debut].debut });
            }
        });
        return avant;
    }, [calage.phrases, mots, prononces]);

    const choisis = selection
        ? mots.slice(Math.min(selection.ancre, selection.bout), Math.max(selection.ancre, selection.bout) + 1)
        : [];
    const debutChoisi = selection ? Math.min(selection.ancre, selection.bout) : 0;

    const cliquer = (i: number, etendre: boolean) => {
        if (etendre && selection) {
            setSelection({ ...selection, bout: i });
            return;
        }
        setSelection({ ancre: i, bout: i });
        const instant = situer(mots[i].debut);
        if (instant !== null) onAller(Math.max(0, instant - 0.3));
    };

    const trancherLaSelection = (coupe: boolean) => {
        if (choisis.length === 0) return;
        const premier = choisis[0];
        const dernier = choisis[choisis.length - 1];
        const avant = mots[debutChoisi - 1];
        const apres = mots[debutChoisi + choisis.length];
        // Couper prend de l'air de part et d'autre, sans mordre sur les mots voisins ;
        // rétablir rend un peu d'air autour des mots, pour qu'ils ne soient pas collés.
        const passage = coupe
            ? {
                debut: Math.min(premier.debut, Math.max(premier.debut - 0.15, avant ? avant.fin + 0.05 : 0)),
                fin: Math.max(dernier.fin, Math.min(dernier.fin + 0.15, apres ? apres.debut - 0.05 : Infinity)),
            }
            : { debut: Math.max(0, premier.debut - 0.15), fin: dernier.fin + 0.2 };
        onTrancherPassage(passage, coupe);
        setSelection(null);
    };

    const ecartees = calage.phrases?.reduce((n, c) =>
        n + c.versions.filter((v, k) => k !== c.retenue && estUneVraieVersion(v)).length, 0) ?? 0;
    const silences = coupes.filter(c => c.motif === 'silence');
    const silencesCoupes = silences.filter(c => estCoupee(c, choix)).length;
    const aDesChoix = Object.keys(choix).length > 0;

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <Etiquette avecIcone><Scissors /> {titre}</Etiquette>
                {aDesChoix && (
                    <Bouton taille="petit" intention="discrete" onClick={onReinitialiser} title="Oublier vos choix : la prise revient au montage proposé">
                        <RotateCcw /> Tout réinitialiser
                    </Bouton>
                )}
            </div>
            <p className="text-xs text-brand-main/60 dark:text-dark-text/60">
                {dureeGardee !== null ? `${secondes(dureeGardee)} gardées sur ${secondes(dureePrise)}` : `Prise de ${secondes(dureePrise)}`}
                {ecartees > 0 ? ` · ${ecartees} version${ecartees > 1 ? 's' : ''} écartée${ecartees > 1 ? 's' : ''}` : ''}
                {silences.length > 0 ? ` · ${silencesCoupes} silence${silencesCoupes > 1 ? 's' : ''} raccourci${silencesCoupes > 1 ? 's' : ''} sur ${silences.length}` : ''}.
                {' '}Le barré est coupé. Un clic sur un mot y mène l'aperçu ; Maj + clic sélectionne un passage, à couper ou à rétablir.
            </p>

            {choisis.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-border dark:border-dark-sec-border p-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-brand-main dark:text-dark-text">
                        « {choisis.map(m => m.texte).join(' ')} » — {choisis.length} mot{choisis.length > 1 ? 's' : ''}
                    </span>
                    {choisis.some(m => !estCoupe(m)) && (
                        <Bouton taille="petit" intention="secondaire" onClick={() => trancherLaSelection(true)}><Scissors /> Couper</Bouton>
                    )}
                    {choisis.some(estCoupe) && (
                        <Bouton taille="petit" intention="secondaire" onClick={() => trancherLaSelection(false)}><RotateCcw /> Rétablir</Bouton>
                    )}
                    <Bouton taille="petit" intention="discrete" onClick={() => setSelection(null)} title="Annuler la sélection"><X /></Bouton>
                </div>
            )}

            {mots.length === 0 ? (
                <p className="text-xs text-brand-main/60 dark:text-dark-text/60">La transcription est vide : rien à monter.</p>
            ) : (
                <p className="text-sm leading-7 text-brand-main dark:text-dark-text">
                    {mots.map((m, i) => {
                        const silence = silenceAvant.get(i);
                        const version = versionAvant.get(i);
                        const nouvelleLigne = i > 0 && m.debut - mots[i - 1].fin > PAUSE_DE_LIGNE;
                        const choisi = selection !== null && i >= debutChoisi && i < debutChoisi + choisis.length;
                        const coupe = estCoupe(m);
                        return (
                            <React.Fragment key={m.premier}>
                                {nouvelleLigne && <br />}
                                {silence && (
                                    <button
                                        type="button"
                                        className="align-middle"
                                        title={estCoupee(silence, choix) ? 'Silence raccourci : le rétablir' : 'Silence gardé : le raccourcir'}
                                        onClick={() => onTrancher([{ coupe: silence, coupee: !estCoupee(silence, choix) }])}
                                    >
                                        <Etiquette as="span" forme="pastille" avecIcone className={estCoupee(silence, choix) ? 'line-through opacity-60' : ''}>
                                            <Pause /> {secondes(silence.fin - silence.debut)}
                                        </Etiquette>
                                    </button>
                                )}
                                {version && (version.retenue
                                    ? <Etiquette as="span" forme="pastille" ton="succes" className="align-middle">Version retenue</Etiquette>
                                    : (
                                        <Bouton
                                            taille="petit"
                                            intention="discrete"
                                            className="align-middle"
                                            onClick={() => onChoisirVersion(version.phrase, version.debut)}
                                        >
                                            Garder cette version
                                        </Bouton>
                                    ))}
                                {' '}
                                <span
                                    role="button"
                                    tabIndex={-1}
                                    data-mot={i}
                                    onClick={(e) => cliquer(i, e.shiftKey)}
                                    className={`cursor-pointer rounded-md hover:underline ${coupe ? 'line-through text-brand-main/40 dark:text-dark-text/40' : ''} ${choisi ? 'bg-brand-main/10 dark:bg-white/15' : ''}`}
                                >
                                    {m.texte}
                                </span>
                            </React.Fragment>
                        );
                    })}
                </p>
            )}
        </div>
    );
};

export default MontageTexte;
