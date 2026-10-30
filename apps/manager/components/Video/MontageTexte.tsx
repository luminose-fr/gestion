import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Scissors, X, Zap } from 'lucide-react';
import {
    estCoupee, estUneVraieVersion, sequenceDeChaqueJeton,
    type Calage, type ChoixDesCoupes, type CoupeProposee, type Intervalle,
} from '@luminose/editorial';
import { Bouton, Etiquette } from '../ui';

/**
 * Le montage par le texte (SPEC §12.5.5) : la prise se lit comme le texte de la
 * vidéo, séquence par séquence.
 *
 * Décidé le 25/10/2026, après une vraie prise : sur une prise brouillonne,
 * l'automatique ne sera jamais parfait, et n'importe quel passage doit pouvoir
 * se couper ou se rétablir, une phrase dite plusieurs fois se reprendre dans la
 * version qu'on préfère.
 *
 * Simplifié le 30/10/2026 (v2.32). Florent, devant le studio à quatre onglets :
 * « hyper confus à utiliser ». Une première maquette — chronologie, étiquettes
 * qu'on glisse — était « démesurément complexe » : une prise comme celle du
 * 30/10 n'appelle que quelques retouches. Il reste deux gestes. Cliquer une
 * phrase l'écoute, la coupe, ou fait choisir sa version quand elle a été dite
 * plusieurs fois ; cliquer l'étiquette d'un écran, puis un mot, l'y fait
 * apparaître. Le texte coupé ne s'affiche plus barré, il noyait la lecture :
 * un ✂ en marque la place, et un clic le montre pour le rétablir.
 */

const secondes = (s: number) => `${s.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
/** « 1:03 » : une durée de vidéo se lit comme dans un lecteur. */
const minutes = (s: number) => {
    const t = Math.max(0, Math.round(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/** Une pause plus longue sépare deux passages : c'est souvent une nouvelle tentative. */
const PAUSE_DE_PASSAGE = 1.2;
/** Une phrase finie ferme un passage gardé : on coupe une phrase, rarement une tirade. */
const FIN_DE_PHRASE = /[.?!…]["»”)]*$/;
/** Une élision que Whisper détache (« c », « 'est ») se recolle : pas d'espace devant elle. */
const ELISION = /^['’‘-]/;
/** Ce qu'on montre d'un passage coupé : de quoi le reconnaître, pas une tirade. */
const APERCU_MAX = 160;

/**
 * Un mot tel que Whisper l'a écrit, avec les jetons qui le composent, la séquence
 * que lui donne son rang, et s'il répond au script — sinon, c'est une improvisation.
 */
interface MotAffiche { texte: string; debut: number; fin: number; premier: number; dernier: number; parRang: number; duScript: boolean }
/** Des mots qui se suivent dans le même état, premier et dernier inclus. */
interface Passage { premier: number; dernier: number }

/** Un écran de scène, ou le coup de poing d'un passage face caméra, posé dans le texte à l'endroit où il apparaît. */
export interface EcranDansLeTexte {
    sequence: number;
    /** Le rang de l'élément dans sa scène ; sans objet pour un coup de poing. */
    element: number;
    libelle: string;
    /** L'instant où il apparaît, en secondes de la prise. */
    instant: number;
    /** Sur le fond sombre de la première moitié, ou le clair de la seconde (v2.30). */
    sombre: boolean;
    /** Son image n'est pas encore fournie : sans elle, l'écran reste vide ou garde son texte. */
    manque?: boolean;
    /** Les mots qui devaient le faire apparaître n'ont pas été dits : sa place est estimée (v2.30). */
    aVerifier?: boolean;
    /** Un coup de poing suit ses mots : il se voit ici, il ne se déplace pas. */
    coup?: boolean;
    /** Déplacé à la main : il peut revenir au calage. */
    corrige?: boolean;
}

/** Ce qui est ouvert sous une séquence : des mots choisis, un passage coupé, ou les versions d'une phrase. */
type Ouvert =
    | { type: 'mots'; ancre: number; bout: number }
    | { type: 'coupe'; mots: number[] }
    | { type: 'versions'; phrase: number; mot: number };

export interface MontageTexteProps {
    /** Seulement pour la seconde accroche : la prise principale a son en-tête dans le studio. */
    titre?: string;
    /** Les séquences du texte calé, dans l'ordre : leur repère, et leur nombre de mots. */
    sequences: Array<{ repere: string; mots: number }>;
    calage: Calage;
    coupes: CoupeProposee[];
    appliquees: Intervalle[];
    /**
     * Ce que la vidéo montre de cette prise, en secondes de la prise. C'est lui
     * qui décide de ce qui est coupé : ce qui précède la première phrase ou suit
     * la dernière n'est dans aucune coupe, et n'est pas dans la vidéo non plus.
     * `null` quand la version affichée ne montre pas cette prise : on s'en tient
     * alors aux coupes.
     */
    gardes: Intervalle[] | null;
    choix: ChoixDesCoupes;
    /** Où un instant de la prise tombe dans la vidéo, ou `null`. */
    situer: (t: number) => number | null;
    /** La séquence que la vidéo montre à un instant donné, en secondes de la vidéo, ou `null`. */
    sequenceDansLaVideo?: (instant: number) => number | null;
    ecrans?: EcranDansLeTexte[];
    onAller: (secondesDansLaVideo: number) => void;
    /** Lire la vidéo à partir d'un instant : on entend la phrase dans son montage. */
    onEcouter?: (secondesDansLaVideo: number) => void;
    /** Lire un passage de la prise brute, en secondes de la prise : une version écartée n'est pas dans la vidéo. */
    onEcouterLaPrise?: (debut: number, fin: number) => void;
    onTrancher: (decisions: Array<{ coupe: CoupeProposee; coupee: boolean }>) => void;
    onTrancherPassage: (passage: Intervalle, coupe: boolean) => void;
    onChoisirVersion: (phrase: number, debut: number) => void;
    /** Un écran apparaît à cet instant de la prise ; `null` le rend au calage. */
    onPlacerEcran?: (sequence: number, element: number, secondes: number | null) => void;
    /** Avec un titre seulement : celui de la prise principale est dans l'en-tête du studio. */
    onReinitialiser?: () => void;
}

export const MontageTexte: React.FC<MontageTexteProps> = ({
    titre, sequences, calage, coupes, appliquees, gardes, choix, situer, sequenceDansLaVideo, ecrans = [],
    onAller, onEcouter, onEcouterLaPrise, onTrancher, onTrancherPassage, onChoisirVersion, onPlacerEcran, onReinitialiser,
}) => {
    const [ouvert, setOuvert] = useState<Ouvert | null>(null);
    const [survol, setSurvol] = useState<Passage | null>(null);
    const [placement, setPlacement] = useState<EcranDansLeTexte | null>(null);
    const prononces = calage.prononces ?? [];
    // Le glissé en cours, et le clic qui le termine : celui-là ne doit pas réduire le choix à un passage.
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
        const echap = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            setOuvert(null);
            setPlacement(null);
        };
        window.addEventListener('mouseup', lacher);
        window.addEventListener('keydown', echap);
        return () => {
            window.removeEventListener('mouseup', lacher);
            window.removeEventListener('keydown', echap);
        };
    }, []);

    const derniere = Math.max(0, sequences.length - 1);
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
            const duScript = p.rang !== null && !p.autrePrise;
            if (p.ecrit || !dernier) {
                liste.push({ texte: p.ecrit, debut: p.debut, fin: p.fin, premier: k, dernier: k, parRang: Math.min(sequenceDuJeton[k] ?? 0, derniere), duScript });
            } else {
                dernier.fin = p.fin;
                dernier.dernier = k;
                dernier.duScript ||= duScript;
            }
        });
        return liste;
    }, [prononces, sequenceDuJeton, derniere]);

    const coupe = useMemo(() => mots.map(m => {
        const milieu = (m.debut + m.fin) / 2;
        return gardes
            ? !gardes.some(g => milieu > g.debut && milieu < g.fin)
            : appliquees.some(c => milieu > c.debut && milieu < c.fin);
    }), [mots, gardes, appliquees]);

    const texteDes = (de: number, a: number) => mots.slice(de, a + 1)
        .map((m, n) => (n > 0 && !ELISION.test(m.texte) ? ' ' : '') + m.texte).join('');

    /*
     * Les phrases dites en plusieurs vraies versions, numérotées dans l'ordre où
     * elles ont été dites : où chacune commence, les mots de la retenue et des
     * écartées, et la pastille « dite 2 fois » au bout de la retenue.
     */
    const { debutVersion, versionEcartee, puceVersion, phraseDuMot, versionsDe } = useMemo(() => {
        const debuts = new Set<number>();
        const ecartees = new Map<number, { phrase: number; debut: number }>();
        const puces = new Map<number, { phrase: number; nombre: number }>();
        const phrases = new Map<number, number>();
        const versions = new Map<number, Array<{ debut: number; fin: number; texte: string; retenue: boolean }>>();
        const motDuJeton = (j: number) => mots.findIndex(m => m.premier <= j && m.dernier >= j);
        const texte = (de: number, a: number) => de < 0 || a < de ? '' : mots.slice(de, a + 1)
            .map((m, n) => (n > 0 && !ELISION.test(m.texte) ? ' ' : '') + m.texte).join('');
        calage.phrases?.forEach((c, s) => {
            const vraies = c.versions.map((v, k) => ({ v, k }))
                .filter(({ v, k }) => k === c.retenue || estUneVraieVersion(v))
                .sort((a, b) => a.v.debut - b.v.debut);
            if (vraies.length < 2) return;
            versions.set(s, vraies.map(({ v, k }) => {
                const de = motDuJeton(v.debut);
                const a = motDuJeton(v.fin);
                if (de >= 0) debuts.add(de);
                for (let j = Math.max(0, de); de >= 0 && j <= a; j++) {
                    if (k === c.retenue) phrases.set(j, s);
                    else ecartees.set(j, { phrase: s, debut: prononces[v.debut].debut });
                }
                if (k === c.retenue && a >= 0) puces.set(a, { phrase: s, nombre: vraies.length });
                return { debut: prononces[v.debut].debut, fin: prononces[v.fin].fin, texte: texte(de, a), retenue: k === c.retenue };
            }));
        });
        return { debutVersion: debuts, versionEcartee: ecartees, puceVersion: puces, phraseDuMot: phrases, versionsDe: versions };
    }, [calage.phrases, mots, prononces]);

    // Un silence proposé appartient au mot qui le suit : il se règle depuis sa phrase.
    const silenceAvant = useMemo(() => {
        const avant = new Map<number, CoupeProposee>();
        for (const c of coupes.filter(x => x.motif === 'silence')) {
            const i = mots.findIndex(m => m.debut >= c.fin - 0.01);
            if (i >= 0) avant.set(i, c);
        }
        return avant;
    }, [coupes, mots]);

    /*
     * La séquence de chaque mot. Un mot du script va à la séquence de son rang,
     * une version écartée à celle de sa phrase, une hésitation à la phrase la
     * plus proche dans le temps (`sequenceDeChaqueJeton`). Une improvisation
     * gardée, elle, se range là où la vidéo la montre quand ce rang l'en
     * éloigne de plus d'une séquence : le 30/10/2026, l'appel à l'action redit
     * en fin de prise se lisait sous « 10 · Bascule », cinq séquences avant
     * l'endroit où il passe. À une séquence près, le rang l'emporte : un « Et
     * donc » improvisé juste avant une phrase du script reste avec elle.
     */
    const sequenceDe = useMemo(() => mots.map((m, i) => {
        if (m.duScript || coupe[i] || !sequenceDansLaVideo) return m.parRang;
        const instant = situer((m.debut + m.fin) / 2);
        const s = instant === null ? null : sequenceDansLaVideo(instant);
        return s !== null && Math.abs(s - m.parRang) > 1 ? Math.min(s, derniere) : m.parRang;
    }), [mots, coupe, situer, sequenceDansLaVideo, derniere]);

    /*
     * Les passages : des mots qui se suivent dans le même état, dans la même
     * séquence. Une version commence toujours un passage, pour se reprendre
     * seule ; une longue pause aussi. Un passage gardé s'arrête en plus à la fin
     * d'une phrase : on coupe une phrase, rarement une tirade.
     */
    const passageDe = useMemo(() => {
        const de: Passage[] = [];
        let courant: Passage | null = null;
        mots.forEach((m, i) => {
            const avant = mots[i - 1];
            const rupture = !courant || !avant
                || coupe[i] !== coupe[i - 1]
                || sequenceDe[i] !== sequenceDe[i - 1]
                || debutVersion.has(i)
                || m.debut - avant.fin > PAUSE_DE_PASSAGE
                || (!coupe[i] && FIN_DE_PHRASE.test(avant.texte));
            if (rupture) courant = { premier: i, dernier: i };
            else courant!.dernier = i;
            de[i] = courant!;
        });
        return de;
    }, [mots, coupe, sequenceDe, debutVersion]);

    // Les écrans, devant le mot où ils apparaissent — celui qu'on est en train de dire à cet instant.
    const ecransAvant = useMemo(() => {
        const avant = new Map<number, EcranDansLeTexte[]>();
        if (mots.length === 0) return avant;
        for (const e of ecrans) {
            const i = mots.findIndex(m => m.fin > e.instant + 0.02);
            const ou = i < 0 ? mots.length - 1 : i;
            avant.set(ou, [...(avant.get(ou) ?? []), e]);
        }
        return avant;
    }, [ecrans, mots]);

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

    const choisis = ouvert?.type === 'mots'
        ? { premier: Math.min(ouvert.ancre, ouvert.bout), dernier: Math.max(ouvert.ancre, ouvert.bout) }
        : null;
    const estChoisi = (i: number) => !!choisis && i >= choisis.premier && i <= choisis.dernier;

    /**
     * La version écartée que touche un passage coupé, s'il en touche une. Le
     * rétablir garderait deux fois la phrase : on prend cette version à la place.
     */
    const ecarteeDans = (p: Passage) => {
        for (let i = p.premier; i <= p.dernier; i++) {
            const v = versionEcartee.get(i);
            if (v) return v;
        }
        return null;
    };

    const retablir = (p: Passage) => {
        setOuvert(null);
        const version = ecarteeDans(p);
        if (version) onChoisirVersion(version.phrase, version.debut);
        else onTrancherPassage(intervalle(p.premier, p.dernier, false), false);
    };

    const cliquer = (i: number, etendre: boolean) => {
        if (placement) {
            onPlacerEcran?.(placement.sequence, placement.element, mots[i].debut);
            setPlacement(null);
            return;
        }
        if (etendre && ouvert?.type === 'mots') {
            setOuvert({ ...ouvert, bout: i });
            return;
        }
        const p = passageDe[i];
        if (choisis?.premier === p.premier && choisis.dernier === p.dernier) {
            setOuvert(null);
            return;
        }
        setOuvert({ type: 'mots', ancre: p.premier, bout: p.dernier });
        const instant = situer(mots[p.premier].debut);
        if (instant !== null) onAller(Math.max(0, instant - 0.3));
    };

    const survole = (i: number) => !!survol && i >= survol.premier && i <= survol.dernier;
    const surligne = (i: number) => estChoisi(i)
        ? 'bg-brand-main/15 dark:bg-white/15'
        : survole(i) ? 'bg-brand-main/10 dark:bg-white/10' : '';
    const arrondi = (i: number) => {
        const p = estChoisi(i) ? choisis : survol;
        if (!p || i < p.premier || i > p.dernier) return '';
        return `${i === p.premier ? 'rounded-l-md' : ''} ${i === p.dernier ? 'rounded-r-md' : ''}`;
    };

    const rendreEcran = (e: EcranDansLeTexte) => {
        const actif = placement?.sequence === e.sequence && placement.element === e.element && !e.coup;
        const ton = actif
            ? 'border-brand-main bg-brand-main text-white dark:border-white dark:bg-white dark:text-brand-main'
            : e.manque || e.aVerifier
                ? `${e.manque ? 'border-dashed' : ''} border-alerte/60 bg-white text-alerte dark:bg-dark-surface`
                : 'border-brand-border bg-white text-brand-main dark:border-dark-sec-border dark:bg-dark-surface dark:text-dark-text';
        const classes = `inline-flex max-w-60 items-center gap-1 h-5 px-1.5 mr-1 rounded-md border text-micro font-semibold align-middle [&_svg]:size-3 ${ton}`;
        const contenu = (
            <>
                {e.coup ? <Zap /> : (
                    <span aria-hidden className={`size-2 shrink-0 rounded-full ${e.sombre ? 'bg-dark-surface dark:bg-dark-text' : 'border border-brand-main/50 dark:border-dark-text/60'}`} />
                )}
                <span className="truncate">{e.libelle}</span>
            </>
        );
        const etat = e.manque ? ' — image à fournir' : e.aVerifier ? ' — à vérifier : ses mots n’ont pas été dits tels quels' : '';
        if (e.coup || !onPlacerEcran) {
            return <span key={`e${e.sequence}-${e.element}`} className={classes} title={e.coup ? `Coup de poing : « ${e.libelle} » — il suit ses mots` : `${e.libelle}${etat}`}>{contenu}</span>;
        }
        return (
            <button
                key={`e${e.sequence}-${e.element}`}
                type="button"
                aria-pressed={actif}
                title={`${e.libelle}${etat} · cliquer, puis le mot où il doit apparaître`}
                onClick={() => { setOuvert(null); setPlacement(actif ? null : e); }}
                className={`${classes} transition-colors ${actif ? '' : 'hover:border-brand-main/40'}`}
            >
                {contenu}
            </button>
        );
    };

    const rendreMot = (i: number, j: number) => {
        const m = mots[i];
        const puce = puceVersion.get(i);
        const espace = j === 0 || (ELISION.test(m.texte) && !coupe[i - 1]) ? null : (
            <span className={(estChoisi(i) && estChoisi(i - 1)) || (survole(i) && survole(i - 1)) ? surligne(i) : ''}> </span>
        );
        return (
            <React.Fragment key={m.premier}>
                {espace}
                {ecransAvant.get(i)?.map(rendreEcran)}
                <span
                    role="button"
                    tabIndex={-1}
                    data-mot={i}
                    onMouseDown={(e) => {
                        if (e.button !== 0 || e.shiftKey || placement) return;
                        e.preventDefault();
                        glisse.current = { ancre: i, aBouge: false };
                    }}
                    onMouseEnter={() => {
                        const g = glisse.current;
                        if (!g) { setSurvol(placement ? { premier: i, dernier: i } : passageDe[i]); return; }
                        if (i === g.ancre && !g.aBouge) return;
                        g.aBouge = true;
                        setOuvert({ type: 'mots', ancre: g.ancre, bout: i });
                    }}
                    onClick={(e) => { if (!ignorerClic.current) cliquer(i, e.shiftKey); }}
                    className={`cursor-pointer transition-colors ${surligne(i)} ${arrondi(i)}`}
                >
                    {m.texte}
                </span>
                {puce && (
                    <button type="button" className="mx-1 align-middle" title="Choisir la version de cette phrase"
                        onClick={() => {
                            setPlacement(null);
                            setOuvert(ouvert?.type === 'versions' && ouvert.phrase === puce.phrase ? null : { type: 'versions', phrase: puce.phrase, mot: i });
                        }}>
                        <Etiquette as="span" forme="pastille">dite {puce.nombre} fois</Etiquette>
                    </button>
                )}
            </React.Fragment>
        );
    };

    /** Des mots coupés qui se suivent : un ✂ à leur place, qu'un clic ouvre. */
    const rendreCoupe = (lesMots: number[], j: number) => {
        const premier = lesMots[0];
        const nombre = lesMots.length;
        const actif = ouvert?.type === 'coupe' && ouvert.mots[0] === premier;
        const libelle = `${nombre} mot${nombre > 1 ? 's' : ''} coupé${nombre > 1 ? 's' : ''}`;
        const ecransDedans = lesMots.flatMap(i => ecransAvant.get(i) ?? []);
        return (
            <React.Fragment key={`c${mots[premier].premier}`}>
                {j > 0 ? ' ' : null}
                {ecransDedans.map(rendreEcran)}
                <button
                    type="button"
                    data-coupe={premier}
                    aria-label={libelle}
                    aria-expanded={actif}
                    title={`${libelle} : cliquer pour les voir`}
                    onClick={() => { if (!placement) setOuvert(actif ? null : { type: 'coupe', mots: lesMots }); }}
                    className={`inline-flex size-5 items-center justify-center rounded-md align-middle transition-colors [&_svg]:size-3.5 ${
                        actif ? 'bg-brand-main text-white dark:bg-white dark:text-brand-main' : 'text-brand-main/50 hover:bg-brand-light hover:text-brand-main dark:text-dark-text/50 dark:hover:bg-dark-sec-bg dark:hover:text-white'
                    }`}
                >
                    <Scissors />
                </button>
            </React.Fragment>
        );
    };

    const rendreSuite = (indices: number[]) => {
        const morceaux: React.ReactNode[] = [];
        for (let n = 0; n < indices.length;) {
            const i = indices[n];
            if (!coupe[i]) {
                morceaux.push(rendreMot(i, n));
                n += 1;
                continue;
            }
            let fin = n;
            while (fin + 1 < indices.length && coupe[indices[fin + 1]]) fin += 1;
            morceaux.push(rendreCoupe(indices.slice(n, fin + 1), n));
            n = fin + 1;
        }
        return morceaux;
    };

    const fermer = (
        <Bouton taille="petit" intention="discrete" className="ml-auto no-underline" aria-label="Fermer" title="Fermer (Échap)" onClick={() => setOuvert(null)}>
            <X />
        </Bouton>
    );
    const cadreDuPanneau = 'mt-2 space-y-3 rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface p-3';

    const rendreVersions = (phrase: number) => {
        const liste = versionsDe.get(phrase) ?? [];
        return (
            <div className="space-y-2">
                <Etiquette>Dite {liste.length === 2 ? 'deux' : liste.length} fois — choisissez la version</Etiquette>
                {liste.map((v, n) => (
                    <div key={n} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                        v.retenue ? 'border-brand-main bg-brand-light dark:border-white dark:bg-dark-sec-bg' : 'border-brand-border dark:border-dark-sec-border'
                    }`}>
                        <label className="min-w-0 flex-1 flex items-start gap-3 cursor-pointer">
                            <input
                                type="radio"
                                name={`version-${phrase}`}
                                checked={v.retenue}
                                onChange={() => {
                                    setOuvert({ type: 'versions', phrase, mot: ouvert?.type === 'versions' ? ouvert.mot : choisis?.premier ?? 0 });
                                    onChoisirVersion(phrase, v.debut);
                                }}
                                className="mt-1 accent-brand-main dark:accent-dark-text"
                            />
                            <span className="text-sm text-brand-main dark:text-dark-text">
                                {v.texte || '—'}
                                <span className="block text-xs text-brand-main/70 dark:text-dark-text/70">
                                    {v.retenue ? 'Dans la vidéo' : `À ${minutes(v.debut)} dans la prise`}
                                </span>
                            </span>
                        </label>
                        {onEcouterLaPrise && (
                            <Bouton taille="petit" intention="secondaire" aria-label="Écouter cette version" title="Écouter cette version"
                                onClick={() => onEcouterLaPrise(v.debut, v.fin)}>
                                <Play />
                            </Bouton>
                        )}
                    </div>
                ))}
            </div>
        );
    };

    const panneauMots = (premier: number, dernier: number) => {
        const lesChoisis = coupe.slice(premier, dernier + 1);
        const toutCoupe = lesChoisis.every(Boolean);
        const rienCoupe = !lesChoisis.some(Boolean);
        const silence = silenceAvant.get(premier);
        let phrase: number | undefined;
        for (let i = premier; i <= dernier && phrase === undefined; i++) phrase = phraseDuMot.get(i);
        const instant = situer(mots[premier].debut);
        const trancher = (couper: boolean) => {
            onTrancherPassage(intervalle(premier, dernier, couper), couper);
            setOuvert(null);
        };
        return (
            <div className={cadreDuPanneau}>
                <div className="flex flex-wrap items-center gap-2">
                    {onEcouter && instant !== null && (
                        <Bouton taille="petit" intention="secondaire" onClick={() => onEcouter(Math.max(0, instant - 0.2))}><Play /> Écouter</Bouton>
                    )}
                    {!toutCoupe && <Bouton taille="petit" intention="secondaire" onClick={() => trancher(true)}><Scissors /> Couper</Bouton>}
                    {!rienCoupe && <Bouton taille="petit" intention="secondaire" onClick={() => trancher(false)}>Rétablir</Bouton>}
                    <span className="text-xs tabular-nums text-brand-main/70 dark:text-dark-text/70">{secondes(mots[dernier].fin - mots[premier].debut)}</span>
                    {fermer}
                </div>
                {silence && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-brand-main dark:text-dark-text [&_svg]:size-3.5">
                        <Pause />
                        <span>
                            {estCoupee(silence, choix)
                                ? `La pause avant est raccourcie de ${secondes(silence.fin - silence.debut)}.`
                                : `La pause avant est gardée entière : ${secondes(silence.fin - silence.debut)} de plus.`}
                        </span>
                        <Bouton taille="petit" intention="discrete" onClick={() => onTrancher([{ coupe: silence, coupee: !estCoupee(silence, choix) }])}>
                            {estCoupee(silence, choix) ? 'La garder entière' : 'La raccourcir'}
                        </Bouton>
                    </div>
                )}
                {phrase !== undefined && rendreVersions(phrase)}
            </div>
        );
    };

    const panneauCoupe = (lesMots: number[]) => {
        // Un passage par tentative : chacune se rétablit seule.
        const groupes: Passage[] = [];
        for (const i of lesMots.filter(x => coupe[x])) {
            const dernierGroupe = groupes[groupes.length - 1];
            if (dernierGroupe && passageDe[i] === passageDe[dernierGroupe.premier] && i === dernierGroupe.dernier + 1) dernierGroupe.dernier = i;
            else groupes.push({ premier: i, dernier: i });
        }
        if (groupes.length === 0) return null;
        return (
            <div className={cadreDuPanneau}>
                <div className="flex items-center gap-2">
                    <Etiquette avecIcone><Scissors /> Coupé</Etiquette>
                    {fermer}
                </div>
                {groupes.map(g => {
                    const texte = texteDes(g.premier, g.dernier);
                    return (
                        <div key={g.premier} className="flex flex-wrap items-center gap-2">
                            <p className="min-w-0 flex-1 text-sm line-through text-brand-main/60 dark:text-dark-text/60" title={texte}>
                                {texte.length > APERCU_MAX ? `${texte.slice(0, APERCU_MAX)}…` : texte}
                            </p>
                            <span className="text-xs tabular-nums text-brand-main/70 dark:text-dark-text/70">{secondes(mots[g.dernier].fin - mots[g.premier].debut)}</span>
                            {onEcouterLaPrise && (
                                <Bouton taille="petit" intention="secondaire" aria-label="Écouter ce passage" title="Écouter ce passage"
                                    onClick={() => onEcouterLaPrise(mots[g.premier].debut, mots[g.dernier].fin)}>
                                    <Play />
                                </Bouton>
                            )}
                            <Bouton taille="petit" intention="secondaire" onClick={() => retablir(g)}>
                                {ecarteeDans(g) ? 'Prendre cette version' : 'Rétablir'}
                            </Bouton>
                        </div>
                    );
                })}
            </div>
        );
    };

    /** Le panneau ouvert, sous la séquence de ce qu'il concerne. */
    const panneauDe = (k: number) => {
        if (!ouvert) return null;
        const ancrage = ouvert.type === 'mots' ? Math.min(ouvert.ancre, ouvert.bout) : ouvert.type === 'coupe' ? ouvert.mots[0] : ouvert.mot;
        if (sequenceDe[ancrage] !== k) return null;
        if (ouvert.type === 'mots') return panneauMots(choisis!.premier, choisis!.dernier);
        if (ouvert.type === 'coupe') return panneauCoupe(ouvert.mots);
        return (
            <div className={cadreDuPanneau}>
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">{rendreVersions(ouvert.phrase)}</div>
                    {fermer}
                </div>
            </div>
        );
    };

    const blocs = (sequences.length > 0 ? sequences : [{ repere: 'La prise', mots: 0 }]).map((s, k) => {
        const indices = mots.flatMap((_, i) => (sequenceDe[i] === k ? [i] : []));
        const premierGarde = indices.find(i => !coupe[i]);
        const instant = premierGarde !== undefined ? situer(mots[premierGarde].debut) : null;
        let note: string | null = null;
        if (premierGarde === undefined) {
            const dits = mots.flatMap((m, i) => (m.parRang === k ? [i] : []));
            const garde = dits.find(i => !coupe[i]);
            note = dits.length === 0 ? 'Pas dite dans la prise.'
                : garde !== undefined && sequenceDe[garde] !== k ? `Dite pendant la séquence ${sequenceDe[garde] + 1}.`
                    : 'Coupée au montage.';
        }
        return { ...s, indices, temps: instant !== null ? minutes(instant) : null, note };
    });

    const aDesChoix = Object.keys(choix).length > 0;

    return (
        <div className="flex flex-col">
            {titre && (
                <div className="flex flex-wrap items-center gap-3 pb-3">
                    <Etiquette forme="entete">{titre}</Etiquette>
                    {onReinitialiser && (
                        <Bouton taille="petit" intention="discrete" className="ml-auto" disabled={!aDesChoix} onClick={onReinitialiser}
                            title={aDesChoix ? 'Oublier vos choix : la prise revient au montage proposé' : 'Rien à défaire : c’est le montage proposé.'}>
                            Revenir au montage proposé
                        </Bouton>
                    )}
                </div>
            )}

            {placement && (
                <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-dark-bg px-3 py-2 text-sm text-white">
                    <span className="min-w-0 flex-1">Cliquez le mot où « {placement.libelle} » doit apparaître.</span>
                    {placement.corrige && (
                        <button type="button"
                            onClick={() => { onPlacerEcran?.(placement.sequence, placement.element, null); setPlacement(null); }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/30 text-xs font-semibold text-white hover:border-white transition-colors [&_svg]:size-3.5">
                            <RotateCcw /> Revenir au calage
                        </button>
                    )}
                    <button type="button" onClick={() => setPlacement(null)}
                        className="px-2.5 py-1.5 rounded-lg border border-transparent text-xs font-semibold text-white/80 underline hover:no-underline">
                        Annuler
                    </button>
                </div>
            )}

            {mots.length === 0 ? (
                <p className="py-4 border-t border-brand-border dark:border-dark-sec-border text-xs text-brand-main/60 dark:text-dark-text/60">
                    La transcription est vide : rien à monter.
                </p>
            ) : (
                <>
                    {!titre && (
                        <p className="pb-3 text-xs text-brand-main/70 dark:text-dark-text/70">
                            Cliquez une phrase pour l’écouter, la couper ou choisir sa version ; l’étiquette d’un écran, pour le déplacer. Un ✂ marque ce qui a été coupé.
                        </p>
                    )}
                    {blocs.map((b, k) => (
                        <div key={k} className="grid grid-cols-[120px_minmax(0,1fr)] gap-5 py-3 border-t border-brand-border dark:border-dark-sec-border">
                            <div className="flex flex-col gap-1 pt-1.5">
                                <Etiquette>{b.repere}</Etiquette>
                                {b.temps && <span className="text-xs tabular-nums text-brand-main/60 dark:text-dark-text/60">{b.temps}</span>}
                            </div>
                            <div className="min-w-0">
                                {b.indices.length === 0 ? (
                                    <p className="text-xs leading-7.5 text-brand-main/60 dark:text-dark-text/60">{b.note}</p>
                                ) : (
                                    <p className="text-sm leading-7.5 text-brand-main dark:text-dark-text" onMouseLeave={() => setSurvol(null)}>
                                        {rendreSuite(b.indices)}
                                    </p>
                                )}
                                {b.indices.length > 0 && b.note && (
                                    <p className="text-xs text-brand-main/60 dark:text-dark-text/60">{b.note}</p>
                                )}
                                {panneauDe(k)}
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
};

export default MontageTexte;
