/**
 * Le dérushage d'une prise (SPEC §12.5.2) : ce qui se coupe sans ouvrir Final
 * Cut — les silences trop longs, les phrases reprises et, sur demande, ce qui
 * sort du script.
 *
 * Décidé le 24/10/2026, après une seconde référence où la voix était débarrassée
 * de ses silences et de ses erreurs sans logiciel de montage. Jusque-là, Florent
 * nettoyait chaque prise à la main avant de la déposer.
 *
 * Calcul pur, sur le calage : il sait déjà quel mot dit répond à quel mot du
 * script. Un mot dit qui ne répond à rien est soit une REPRISE — on recommence
 * une phrase ratée, et l'alignement retient la dernière version, la bonne —, soit
 * une IMPROVISATION. La première se coupe d'office ; la seconde se propose
 * seulement : elle peut être ce que la prise a de meilleur.
 *
 * Rien n'est définitif : chaque coupe se rétablit, et le choix se garde avec la
 * prise.
 */
import type { Calage, Prononce } from './calage';
import { creuxLePlusProche } from './enveloppe';

export interface Intervalle {
    debut: number;
    fin: number;
}

export type MotifCoupe = 'silence' | 'reprise' | 'hors-script';

export interface CoupeProposee extends Intervalle {
    /** Ce qui identifie la coupe d'une lecture à l'autre : son motif et son début, au dixième. */
    cle: string;
    motif: MotifCoupe;
    /** Ce qui a été dit dans l'intervalle, tel que Whisper l'a écrit — vide pour un silence. */
    texte: string;
    /** Coupée tant que Florent n'a rien dit : les silences et les reprises, pas l'improvisation. */
    parDefaut: boolean;
}

/** Un silence plus long se raccourcit : en vidéo courte, une seconde de vide, c'est un pouce qui défile. */
export const SILENCE_MAX = 0.7;
/**
 * L'air gardé de part et d'autre d'une coupe. Whisper place les bords d'un mot
 * à quelques centièmes près : couper au ras ampute une syllabe. Plus après
 * qu'avant, parce qu'une fin de mot traîne plus qu'une attaque.
 */
const GARDE_APRES = 0.2;
const GARDE_AVANT = 0.15;
/** En deçà, la coupe ne vaut pas le saut d'image qu'elle crée. */
const COUPE_MIN = 0.25;
/** Une improvisation de un ou deux mots (« vraiment », « et donc ») reste : la couper ferait sauter l'image au milieu d'une phrase. */
const HORS_SCRIPT_MIN = 3;
/** Jusqu'où l'on déplace un bord de coupe pour le faire tomber dans un silence. */
const VERS_LE_SILENCE = 0.25;

const MOTIFS: Record<MotifCoupe, string> = { silence: 's', reprise: 'r', 'hors-script': 'h' };

export const cleDeCoupe = (motif: MotifCoupe, debut: number): string => `${MOTIFS[motif]}${debut.toFixed(1)}`;

/**
 * Un passage dit hors du script reprend-il ce qui l'entoure ? Deux cas :
 * on recommence — « le corps garde la… le corps garde la mémoire », le passage
 * commence comme ce qui le suit — ou on répète ce qu'on vient de dire.
 * Les mots courants (« la », « de ») se retrouvent partout : un seul mot en
 * commun ne suffit pas, sauf pour un bégaiement d'un mot.
 */
function estUneReprise(passage: Prononce[], avant: Prononce[], apres: Prononce[]): boolean {
    const mots = passage.map(p => p.mot);
    const voisins = new Set([...avant.slice(-(mots.length + 2)), ...apres.slice(0, mots.length + 2)].map(p => p.mot));
    const communs = mots.filter(m => voisins.has(m)).length / mots.length;
    if (apres[0] && mots[0] === apres[0].mot) {
        return mots.length === 1 || mots[1] === apres[1]?.mot || communs >= 0.5;
    }
    return mots.length >= 2 && communs >= 0.6;
}

/**
 * Les coupes que la prise appelle, dans l'ordre de la prise. On ne regarde
 * qu'entre le premier et le dernier mot du script : la tête et la queue, le
 * plan de montage les retire déjà.
 */
export function coupesProposees(calage: Calage): CoupeProposee[] {
    const p = calage.prononces ?? [];
    const retenus = p.flatMap((x, k) => x.rang === null ? [] : [k]);
    if (retenus.length < 2) return [];

    const coupes: CoupeProposee[] = [];
    // Les écarts (entre le mot k et le suivant) qu'une reprise coupée couvre déjà.
    const couverts = new Set<number>();

    /*
     * Un bord de coupe tombe dans un silence, quand le son le permet (§12.5.4).
     * `garde` est l'instant de la parole qu'on garde de ce côté — la fin du mot
     * avant la coupe, ou le début du mot après. Si le bord tombe dans la voix de
     * ce mot-là, on le pousse au bout de cette voix ; s'il tombe dans la voix
     * qu'on coupe, on le ramène à son début (ou à sa fin). Plus loin que
     * VERS_LE_SILENCE, ou sans enveloppe, on prend le creux sonore le plus
     * proche : c'est là qu'une coupe s'entend le moins.
     */
    const parole = calage.parole;
    const aplomb = (t: number, garde: number, cote: 'debut' | 'fin'): number => {
        if (!parole) return t;
        const r = parole.find(x => t > x.debut && t < x.fin);
        if (!r) return t;
        const sienne = garde >= r.debut && garde <= r.fin;
        const bord = cote === 'debut' ? (sienne ? r.fin : r.debut) : (sienne ? r.debut : r.fin);
        return Math.abs(bord - t) <= VERS_LE_SILENCE ? bord : creuxLePlusProche(calage.enveloppe, t, 0.1);
    };

    const proposer = (motif: MotifCoupe, debutVise: number, finVisee: number, texte: string, parDefaut: boolean, avant: Prononce, apres: Prononce) => {
        const debut = aplomb(debutVise, avant.fin, 'debut');
        const fin = aplomb(finVisee, apres.debut, 'fin');
        if (fin - debut < COUPE_MIN) return;
        coupes.push({ cle: cleDeCoupe(motif, debut), motif, debut, fin, texte, parDefaut });
    };

    // Les passages hors du script, entre deux mots qui y répondent.
    for (let r = 0; r + 1 < retenus.length; r++) {
        const k = retenus[r];
        const k2 = retenus[r + 1];
        if (k2 === k + 1) continue;
        const passage = p.slice(k + 1, k2);
        const avant = retenus.slice(0, r + 1).map(i => p[i]);
        const apres = retenus.slice(r + 1).map(i => p[i]);
        const texte = passage.map(x => x.ecrit).filter(Boolean).join(' ');
        if (estUneReprise(passage, avant, apres)) {
            proposer('reprise', p[k].fin + GARDE_APRES, p[k2].debut - GARDE_AVANT, texte, true, p[k], p[k2]);
            for (let g = k; g < k2; g++) couverts.add(g);
        } else if (passage.length >= HORS_SCRIPT_MIN) {
            proposer('hors-script', p[k].fin + GARDE_APRES, p[k2].debut - GARDE_AVANT, texte, false, p[k], p[k2]);
        }
    }

    // Les silences, partout ailleurs — y compris autour d'une improvisation
    // qu'on garde : la garder ne veut pas dire garder le vide qui l'entoure.
    const premier = retenus[0];
    const dernier = retenus[retenus.length - 1];
    for (let g = premier; g < dernier; g++) {
        if (couverts.has(g)) continue;
        if (p[g + 1].debut - p[g].fin > SILENCE_MAX) {
            proposer('silence', p[g].fin + GARDE_APRES, p[g + 1].debut - GARDE_AVANT, '', true, p[g], p[g + 1]);
        }
    }

    return coupes.sort((a, b) => a.debut - b.debut);
}

/** Un choix de Florent : `true` coupe, `false` garde. Absent, la coupe suit son défaut. */
export type ChoixDesCoupes = Record<string, boolean>;

/**
 * Le choix qui vaut pour une coupe. Une nouvelle transcription de la même
 * prise peut décaler un bord de quelques centièmes : un choix retrouve sa coupe
 * à trois dixièmes près, pourvu que le motif soit le même.
 */
export function estCoupee(coupe: CoupeProposee, choix: ChoixDesCoupes | undefined): boolean {
    if (!choix) return coupe.parDefaut;
    if (coupe.cle in choix) return choix[coupe.cle];
    const prefixe = MOTIFS[coupe.motif];
    for (const [cle, valeur] of Object.entries(choix)) {
        if (cle[0] === prefixe && Math.abs(Number(cle.slice(1)) - coupe.debut) <= 0.3) return valeur;
    }
    return coupe.parDefaut;
}

/**
 * Le choix suivant, une fois une coupe tranchée : l'ancien choix de cette coupe
 * s'efface — sous sa clé ou sous une clé voisine —, et rien ne se garde quand
 * Florent revient au défaut. Le choix ne retient que ce qui s'en écarte.
 */
export function choisir(choix: ChoixDesCoupes | undefined, coupe: CoupeProposee, coupee: boolean): ChoixDesCoupes {
    const prefixe = MOTIFS[coupe.motif];
    const suite = Object.fromEntries(Object.entries(choix ?? {}).filter(([cle]) =>
        cle !== coupe.cle && !(cle[0] === prefixe && Math.abs(Number(cle.slice(1)) - coupe.debut) <= 0.3)));
    if (coupee !== coupe.parDefaut) suite[coupe.cle] = coupee;
    return suite;
}

/** Les intervalles à retirer de la prise, triés et fusionnés : c'est ce que le plan de montage attend. */
export function coupesAppliquees(proposees: CoupeProposee[], choix: ChoixDesCoupes | undefined): Intervalle[] {
    const retenues = proposees
        .filter(c => estCoupee(c, choix))
        .map(c => ({ debut: c.debut, fin: c.fin }))
        .sort((a, b) => a.debut - b.debut);
    const fusion: Intervalle[] = [];
    for (const c of retenues) {
        const derniere = fusion[fusion.length - 1];
        if (derniere && c.debut <= derniere.fin) derniere.fin = Math.max(derniere.fin, c.fin);
        else fusion.push({ ...c });
    }
    return fusion;
}

/** Le temps que les coupes retirent, en secondes. */
export const dureeCoupee = (coupes: Intervalle[]): number =>
    coupes.reduce((s, c) => s + (c.fin - c.debut), 0);
