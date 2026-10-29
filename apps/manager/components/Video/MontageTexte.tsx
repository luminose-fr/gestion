import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause } from 'lucide-react';
import {
    estCoupee, estUneVraieVersion, sequenceDeChaqueJeton,
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
 * Refait le 27/10/2026 d'après la passation « le fil » (SPEC §13.11), que
 * Florent a trouvée nettement plus utilisable : le texte se lit séquence par
 * séquence, comme le script, en passages. Un clic sur un passage le choisit et
 * y amène l'aperçu, « Barrer » le coupe ; un clic sur un passage barré le
 * rétablit — une version écartée, elle, devient la version retenue. Glisser sur
 * des mots, ou Maj + clic, en choisit le détail.
 */

const secondes = (s: number) => `${s.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
/** « 1:03 » : une durée de vidéo se lit comme dans un lecteur. */
const minutes = (s: number) => {
    const t = Math.max(0, Math.round(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/** Une pause plus longue sépare deux passages : c'est souvent une nouvelle tentative. */
const PAUSE_DE_PASSAGE = 1.2;
/** Une phrase finie ferme un passage gardé : on barre une phrase, rarement une tirade. */
const FIN_DE_PHRASE = /[.?!…]["»”)]*$/;

/** Un mot tel que Whisper l'a écrit, avec les jetons qui le composent, et sa séquence. */
interface MotAffiche { texte: string; debut: number; fin: number; premier: number; dernier: number; sequence: number }
/** Des mots qui se suivent dans le même état, premier et dernier inclus. */
interface Passage { premier: number; dernier: number }

export interface MontageTexteProps {
    /** Seulement pour la seconde accroche : la prise principale n'a pas besoin de nom. */
    titre?: string;
    /** Les séquences du texte calé, dans l'ordre : leur repère, et leur nombre de mots. */
    sequences: Array<{ repere: string; mots: number }>;
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
    titre, sequences, calage, coupes, appliquees, gardes, choix, dureePrise, dureeGardee, situer, onAller,
    onTrancher, onTrancherPassage, onChoisirVersion, onReinitialiser,
}) => {
    const [selection, setSelection] = useState<{ ancre: number; bout: number } | null>(null);
    const [survol, setSurvol] = useState<Passage | null>(null);
    const prononces = calage.prononces ?? [];
    // Le glissé en cours, et le clic qui le termine : celui-là ne doit pas réduire la sélection à un passage.
    const glisse = useRef<{ ancre: number; aBouge: boolean } | null>(null);
    const ignorerClic = useRef(false);
    useEffect(() => {
        const lacher = () => {
            if (glisse.current?.aBouge) {
                ignorerClic.current = true;
                setTimeout(() => { ignorerClic.current = false; }, 0);
            }
            glisse.current = null;
        };
        const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelection(null); };
        window.addEventListener('mouseup', lacher);
        window.addEventListener('keydown', echap);
        return () => {
            window.removeEventListener('mouseup', lacher);
            window.removeEventListener('keydown', echap);
        };
    }, []);

    const motsParSequence = sequences.map(s => s.mots).join(',');
    const sequenceDuJeton = useMemo(
        () => sequenceDeChaqueJeton(calage, motsParSequence.split(',').map(Number)),
        [calage, motsParSequence],
    );

    // Les jetons regroupés en mots tels que Whisper les a écrits : « l'envoyer » est un mot à l'écran.
    const mots = useMemo<MotAffiche[]>(() => {
        const liste: MotAffiche[] = [];
        prononces.forEach((p, k) => {
            const dernier = liste[liste.length - 1];
            if (p.ecrit || !dernier) {
                liste.push({ texte: p.ecrit, debut: p.debut, fin: p.fin, premier: k, dernier: k, sequence: Math.min(sequenceDuJeton[k] ?? 0, Math.max(0, sequences.length - 1)) });
            } else { dernier.fin = p.fin; dernier.dernier = k; }
        });
        return liste;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prononces, sequenceDuJeton, sequences.length]);

    const estCoupe = (m: MotAffiche) => {
        const milieu = (m.debut + m.fin) / 2;
        return gardes
            ? !gardes.some(g => milieu > g.debut && milieu < g.fin)
            : appliquees.some(c => milieu > c.debut && milieu < c.fin);
    };
    const coupe = useMemo(() => mots.map(estCoupe),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [mots, gardes, appliquees]);

    // Un silence proposé s'affiche devant le mot qui le suit.
    const silenceAvant = useMemo(() => {
        const avant = new Map<number, CoupeProposee>();
        for (const c of coupes.filter(x => x.motif === 'silence')) {
            const i = mots.findIndex(m => m.debut >= c.fin - 0.01);
            if (i >= 0) avant.set(i, c);
        }
        return avant;
    }, [coupes, mots]);

    /*
     * Les phrases dites en plusieurs vraies versions : où chaque version
     * commence — une version écartée se reprend d'un clic —, et, après la
     * retenue, la puce « version 1 sur 2 » qui passe à la suivante.
     */
    const { debutVersion, versionEcartee, puceVersion, phrasesAVersions, versionsMax } = useMemo(() => {
        const debuts = new Map<number, { phrase: number; retenue: boolean; debut: number }>();
        const ecartees = new Map<number, { phrase: number; debut: number }>();
        const puces = new Map<number, { libelle: string; phrase: number; suivante: number }>();
        let nombre = 0;
        let max = 0;
        const motDuJeton = (j: number) => mots.findIndex(m => m.premier <= j && m.dernier >= j);
        calage.phrases?.forEach((c, s) => {
            // Numérotées dans l'ordre où elles ont été dites : « version 2 », c'est la deuxième tentative.
            const vraies = c.versions.map((v, k) => ({ v, k }))
                .filter(({ v, k }) => k === c.retenue || estUneVraieVersion(v))
                .sort((a, b) => a.v.debut - b.v.debut);
            if (vraies.length < 2) return;
            nombre += 1;
            max = Math.max(max, vraies.length);
            for (const { v, k } of vraies) {
                const i = motDuJeton(v.debut);
                if (i >= 0) debuts.set(i, { phrase: s, retenue: k === c.retenue, debut: prononces[v.debut].debut });
                if (i < 0 || k === c.retenue) continue;
                for (let j = i; j <= motDuJeton(v.fin); j++) ecartees.set(j, { phrase: s, debut: prononces[v.debut].debut });
            }
            const rang = vraies.findIndex(({ k }) => k === c.retenue);
            const retenue = vraies[rang];
            const suivante = vraies[(rang + 1) % vraies.length];
            const fin = retenue ? motDuJeton(retenue.v.fin) : -1;
            if (fin >= 0) puces.set(fin, { libelle: `version ${rang + 1} sur ${vraies.length}`, phrase: s, suivante: prononces[suivante.v.debut].debut });
        });
        return { debutVersion: debuts, versionEcartee: ecartees, puceVersion: puces, phrasesAVersions: nombre, versionsMax: max };
    }, [calage.phrases, mots, prononces]);

    /*
     * Les passages : des mots qui se suivent dans le même état, dans la même
     * séquence. Une version commence toujours un passage, pour se reprendre
     * seule ; une longue pause aussi. Un passage gardé s'arrête en plus à la fin
     * d'une phrase : on barre une phrase, rarement une tirade.
     */
    const passageDe = useMemo(() => {
        const de: Passage[] = [];
        let courant: Passage | null = null;
        mots.forEach((m, i) => {
            const avant = mots[i - 1];
            const rupture = !courant || !avant
                || coupe[i] !== coupe[i - 1]
                || m.sequence !== avant.sequence
                || debutVersion.has(i)
                || m.debut - avant.fin > PAUSE_DE_PASSAGE
                || (!coupe[i] && FIN_DE_PHRASE.test(avant.texte));
            if (rupture) courant = { premier: i, dernier: i };
            else courant!.dernier = i;
            de[i] = courant!;
        });
        return de;
    }, [mots, coupe, debutVersion]);

    // Couper prend de l'air de part et d'autre, sans mordre sur les mots voisins ;
    // rétablir rend un peu d'air autour des mots, pour qu'ils ne soient pas collés.
    const intervalle = (de: number, a: number, couper: boolean): Intervalle => {
        const premier = mots[de];
        const dernier = mots[a];
        const avant = mots[de - 1];
        const apres = mots[a + 1];
        return couper
            ? {
                debut: Math.min(premier.debut, Math.max(premier.debut - 0.15, avant ? avant.fin + 0.05 : 0)),
                fin: Math.max(dernier.fin, Math.min(dernier.fin + 0.15, apres ? apres.debut - 0.05 : Infinity)),
            }
            : { debut: Math.max(0, premier.debut - 0.15), fin: dernier.fin + 0.2 };
    };

    const debutChoisi = selection ? Math.min(selection.ancre, selection.bout) : -1;
    const finChoisie = selection ? Math.max(selection.ancre, selection.bout) : -1;
    const estChoisi = (i: number) => i >= debutChoisi && i <= finChoisie;
    const choisis = selection ? coupe.slice(debutChoisi, finChoisie + 1) : [];
    const toutCoupe = choisis.length > 0 && choisis.every(Boolean);
    const rienCoupe = choisis.length > 0 && !choisis.some(Boolean);

    /**
     * La version écartée que touche un passage barré, s'il en touche une. Le
     * rétablir garderait deux fois la phrase : on prend cette version à la place.
     */
    const ecarteeDans = (p: Passage) => {
        for (let i = p.premier; i <= p.dernier; i++) {
            const v = versionEcartee.get(i);
            if (v) return v;
        }
        return null;
    };

    /** Un passage barré se rétablit ; une version écartée devient la retenue. */
    const retablir = (p: Passage) => {
        setSelection(null);
        const version = ecarteeDans(p);
        if (version) onChoisirVersion(version.phrase, version.debut);
        else onTrancherPassage(intervalle(p.premier, p.dernier, false), false);
    };

    const cliquer = (i: number, etendre: boolean) => {
        if (etendre && selection) {
            setSelection({ ...selection, bout: i });
            return;
        }
        const p = passageDe[i];
        if (coupe[i]) { retablir(p); return; }
        if (debutChoisi === p.premier && finChoisie === p.dernier) { setSelection(null); return; }
        setSelection({ ancre: p.premier, bout: p.dernier });
        const instant = situer(mots[p.premier].debut);
        if (instant !== null) onAller(Math.max(0, instant - 0.3));
    };

    const trancherLaSelection = (couper: boolean) => {
        if (!selection) return;
        onTrancherPassage(intervalle(debutChoisi, finChoisie, couper), couper);
        setSelection(null);
    };

    const nombreDeCoupes = coupe.filter((c, i) => c && !coupe[i - 1]).length;
    const silences = coupes.filter(c => c.motif === 'silence');
    const silencesCoupes = silences.filter(c => estCoupee(c, choix)).length;
    const aDesChoix = Object.keys(choix).length > 0;
    const resume = [
        `${nombreDeCoupes} coupe${nombreDeCoupes > 1 ? 's' : ''}`,
        phrasesAVersions > 0 ? `${phrasesAVersions} phrase${phrasesAVersions > 1 ? 's' : ''} en ${versionsMax === 2 ? 'deux' : 'plusieurs'} versions` : null,
        silences.length > 0 ? `${silencesCoupes} silence${silencesCoupes > 1 ? 's' : ''} raccourci${silencesCoupes > 1 ? 's' : ''} sur ${silences.length}` : null,
    ].filter(Boolean).join(' · ');

    const blocs = (sequences.length > 0 ? sequences : [{ repere: 'La prise', mots: 0 }]).map((s, k) => {
        const indices = mots.flatMap((m, i) => (m.sequence === k ? [i] : []));
        const premierGarde = indices.find(i => !coupe[i]);
        const instant = premierGarde !== undefined ? situer(mots[premierGarde].debut) : null;
        return { ...s, indices, temps: instant !== null ? minutes(instant) : indices.length > 0 ? 'coupée' : null };
    });

    const survole = (i: number) => !!survol && i >= survol.premier && i <= survol.dernier;
    const surligne = (i: number) => estChoisi(i)
        ? 'bg-brand-main/15 dark:bg-white/15'
        : survole(i) && !coupe[i] ? 'bg-brand-main/10 dark:bg-white/10' : '';
    const arrondi = (i: number) => {
        const p = estChoisi(i) ? { premier: debutChoisi, dernier: finChoisie } : survol;
        if (!p || i < p.premier || i > p.dernier) return '';
        return `${i === p.premier ? 'rounded-l-md' : ''} ${i === p.dernier ? 'rounded-r-md' : ''}`;
    };

    const rendreMot = (i: number, j: number) => {
        const m = mots[i];
        const silence = silenceAvant.get(i);
        const puce = puceVersion.get(i);
        const barre = coupe[i];
        // L'espace entre deux mots prend leur état commun : surlignage et barre restent d'un seul tenant.
        // Une élision que Whisper détache (« c », « 'est ») se recolle : pas d'espace devant elle.
        const elision = /^['’‘-]/.test(m.texte);
        const espace = j === 0 || (elision && !silence) ? null : silence ? ' ' : (
            <span className={[
                (estChoisi(i) && estChoisi(i - 1)) || (survole(i) && survole(i - 1)) ? surligne(i) : '',
                barre && coupe[i - 1] ? 'line-through text-brand-main/40 dark:text-dark-text/40' : '',
            ].join(' ')}> </span>
        );
        return (
            <React.Fragment key={m.premier}>
                {espace}
                {silence && (
                    <>
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
                        {' '}
                    </>
                )}
                <span
                    role="button"
                    tabIndex={-1}
                    data-mot={i}
                    title={barre ? (ecarteeDans(passageDe[i])
                        ? 'Prendre cette version'
                        : `Rétablir ce passage · ${secondes(mots[passageDe[i].dernier].fin - mots[passageDe[i].premier].debut)}`) : undefined}
                    onMouseDown={(e) => {
                        if (e.button !== 0 || e.shiftKey) return;
                        e.preventDefault();
                        glisse.current = { ancre: i, aBouge: false };
                    }}
                    onMouseEnter={() => {
                        const g = glisse.current;
                        if (!g) { setSurvol(passageDe[i]); return; }
                        if (i === g.ancre && !g.aBouge) return;
                        g.aBouge = true;
                        setSelection({ ancre: g.ancre, bout: i });
                    }}
                    onClick={(e) => { if (!ignorerClic.current) cliquer(i, e.shiftKey); }}
                    className={`cursor-pointer transition-colors ${surligne(i)} ${arrondi(i)} ${
                        barre ? `line-through ${survole(i) ? 'text-brand-main/70 dark:text-dark-text/70' : 'text-brand-main/40 dark:text-dark-text/40'}` : ''
                    }`}
                >
                    {m.texte}
                </span>
                {i === finChoisie && (
                    <span className="inline-flex gap-1 mx-1.5 align-middle">
                        {!toutCoupe && <Bouton taille="petit" intention="secondaire" onClick={() => trancherLaSelection(true)}>Barrer</Bouton>}
                        {!rienCoupe && <Bouton taille="petit" intention="secondaire" onClick={() => trancherLaSelection(false)}>Rétablir</Bouton>}
                    </span>
                )}
                {puce && !barre && (
                    <button type="button" className="mx-1.5 align-middle" title="Prendre la version suivante"
                        onClick={() => { setSelection(null); onChoisirVersion(puce.phrase, puce.suivante); }}>
                        <Etiquette as="span" forme="pastille">{puce.libelle}</Etiquette>
                    </button>
                )}
            </React.Fragment>
        );
    };

    return (
        <div className="flex flex-col">
            {titre && <Etiquette forme="entete" className="pb-2">{titre}</Etiquette>}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-4">
                <span className="text-lg font-bold tabular-nums text-brand-main dark:text-white">{minutes(dureeGardee ?? dureePrise)}</span>
                <span className="text-sm text-brand-main/80 dark:text-dark-text/80">
                    {dureeGardee !== null ? `gardées sur ${minutes(dureePrise)}` : 'de prise'}{resume ? ` · ${resume}` : ''}
                </span>
                <button
                    type="button"
                    onClick={onReinitialiser}
                    disabled={!aDesChoix}
                    title={aDesChoix ? 'Oublier vos choix : la prise revient au montage proposé' : 'Rien à réinitialiser : c’est le montage proposé.'}
                    className="ml-auto h-9 px-2 text-sm font-semibold underline hover:no-underline text-brand-main/80 dark:text-dark-text/80 disabled:opacity-40 disabled:no-underline"
                >
                    Réinitialiser
                </button>
            </div>

            {mots.length === 0 ? (
                <p className="py-4 border-t border-brand-border dark:border-dark-sec-border text-xs text-brand-main/60 dark:text-dark-text/60">
                    La transcription est vide : rien à monter.
                </p>
            ) : blocs.map((b, k) => (
                <div key={k} className="grid grid-cols-[120px_minmax(0,1fr)] gap-5 py-4 border-t border-brand-border dark:border-dark-sec-border">
                    <div className="flex flex-col gap-1">
                        <Etiquette>{b.repere}</Etiquette>
                        {b.temps && <span className="text-xs tabular-nums text-brand-main/60 dark:text-dark-text/60">{b.temps}</span>}
                    </div>
                    {b.indices.length === 0 ? (
                        <p className="text-xs leading-7.5 text-brand-main/60 dark:text-dark-text/60">Pas dite dans la prise.</p>
                    ) : (
                        <p className="text-sm leading-7.5 text-brand-main dark:text-dark-text" onMouseLeave={() => setSurvol(null)}>
                            {b.indices.map((i, j) => rendreMot(i, j))}
                        </p>
                    )}
                </div>
            ))}

            <p className="pt-4 border-t border-brand-border dark:border-dark-sec-border text-xs text-brand-main/70 dark:text-dark-text/70">
                Cliquer un passage y amène l’aperçu ; « Barrer » le coupe ; cliquer un passage barré le rétablit. Glisser sur des mots en choisit le détail.
            </p>
        </div>
    );
};

export default MontageTexte;
