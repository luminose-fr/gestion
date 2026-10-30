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
import { HESITATIONS, sousSuiteCommune } from './directe';

export interface Intervalle {
    debut: number;
    fin: number;
}

export type MotifCoupe = 'silence' | 'reprise' | 'hors-script' | 'hesitation';

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
/**
 * À une fin de phrase, plus d'air : 0,6 s en tout plutôt que 0,35 s (v2.30,
 * décision de Florent du 30/10/2026). La vidéo du 30/10 ne gardait aucun blanc
 * de plus de 0,6 s, et Florent la trouvait trop rapide. Un silence plus long
 * se coupe toujours ; on ne coupe plus jusqu'à l'os entre deux idées.
 */
const GARDE_APRES_PHRASE = 0.35;
const GARDE_AVANT_PHRASE = 0.25;
const airApres = (m: Prononce) => m.finDePhrase ? GARDE_APRES_PHRASE : GARDE_APRES;
const airAvant = (avant: Prononce) => avant.finDePhrase ? GARDE_AVANT_PHRASE : GARDE_AVANT;
/** En deçà, la coupe ne vaut pas le saut d'image qu'elle crée. */
const COUPE_MIN = 0.25;
/** Une improvisation de un ou deux mots (« vraiment », « et donc ») reste : la couper ferait sauter l'image au milieu d'une phrase. */
const HORS_SCRIPT_MIN = 3;
/** Jusqu'où l'on déplace un bord de coupe pour le faire tomber dans un silence. */
const VERS_LE_SILENCE = 0.25;

/**
 * Une improvisation redite peu après, avec à peu près les mêmes mots, est un
 * premier jet (v2.30). Florent adapte le script à sa façon de parler : une
 * phrase refaite autrement ne ressemble plus assez au script pour être reconnue
 * comme une de ses versions, et ses deux formulations restaient. On compare
 * donc l'essai à ce qui le suit, comme pour une vidéo sans script (§12.7) — sur
 * les mots pleins seulement : « de », « la », « en » se retrouvent partout.
 */
const REDITE = { seuil: 0.6, secondes: 25, motsMin: 3 };
/** Plus long, un blanc sépare deux essais d'une improvisation. */
const ESSAI_PAUSE = 0.6;
const motsPleins = (dits: Prononce[]) => dits.map(d => d.mot).filter(m => m.length >= 3 && !HESITATIONS.has(m));
function estRedite(passage: Prononce[], suite: Prononce[]): boolean {
    const pleins = motsPleins(passage);
    if (pleins.length < REDITE.motsMin) return false;
    const fin = passage[passage.length - 1].fin;
    const proches = motsPleins(suite.filter(d => d.debut - fin <= REDITE.secondes));
    return sousSuiteCommune(pleins, proches) / pleins.length >= REDITE.seuil;
}

const MOTIFS: Record<MotifCoupe, string> = { silence: 's', reprise: 'r', 'hors-script': 'h', hesitation: 'e' };

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
 * plan de montage les retire déjà — et dans la fin improvisée, quand il en
 * monte une (v2.29).
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
        // L'amorce d'une reformulation retenue part avec elle, jamais avec la reprise qui la précède (v2.29).
        let k2 = retenus[r + 1];
        while (k2 - 1 > k && p[k2 - 1].amorce) k2--;
        if (k2 === k + 1) continue;
        const passage = p.slice(k + 1, k2);
        const avant = retenus.slice(0, r + 1).map(i => p[i]);
        const apres = retenus.slice(r + 1).map(i => p[i]);
        const texte = passage.map(x => x.ecrit).filter(Boolean).join(' ');
        // « Euh », « hum » : une hésitation se coupe d'office, même seule (§12.7).
        if (passage.every(x => HESITATIONS.has(x.mot))) {
            proposer('hesitation', p[k].fin + airApres(p[k]), p[k2].debut - airAvant(p[k]), texte, true, p[k], p[k2]);
            for (let g = k; g < k2; g++) couverts.add(g);
            continue;
        }
        // Une autre version d'une phrase du script, écartée par le choix des prises (§12.5.5),
        // est une reprise, quels que soient ses mots : elle redirait ce qui est dit.
        if (passage.some(x => x.autrePrise) || estUneReprise(passage, avant, apres)) {
            proposer('reprise', p[k].fin + airApres(p[k]), p[k2].debut - airAvant(p[k]), texte, true, p[k], p[k2]);
            for (let g = k; g < k2; g++) couverts.add(g);
            continue;
        }
        /*
         * Une improvisation se lit par essais, séparés par une respiration ou une
         * fin de phrase (v2.30) : un essai redit plus loin est un premier jet, et
         * se coupe ; le reste se propose, comme avant. Deux formulations d'une
         * même idée, dites l'une après l'autre entre deux phrases du script,
         * formaient un seul passage, gardé en entier.
         */
        const essais: Array<[number, number]> = [];
        for (let g = k + 1; g < k2; g++) {
            const nouveau = g === k + 1 || p[g].debut - p[g - 1].fin >= ESSAI_PAUSE || p[g - 1].finDePhrase;
            if (nouveau) essais.push([g, g]);
            else essais[essais.length - 1][1] = g;
        }
        const redits = essais.map(([de, a]) => estRedite(p.slice(de, a + 1), p.slice(a + 1)));
        for (let e = 0; e < essais.length;) {
            let f = e;
            while (f + 1 < essais.length && redits[f + 1] === redits[e]) f++;
            const de = essais[e][0];
            const a = essais[f][1];
            const morceau = p.slice(de, a + 1).map(x => x.ecrit).filter(Boolean).join(' ');
            if (redits[e]) {
                proposer('reprise', p[de - 1].fin + airApres(p[de - 1]), p[a + 1].debut - airAvant(p[de - 1]), morceau, true, p[de - 1], p[a + 1]);
                for (let g = de - 1; g <= a; g++) couverts.add(g);
            } else if (a - de + 1 >= HORS_SCRIPT_MIN) {
                proposer('hors-script', p[de - 1].fin + airApres(p[de - 1]), p[a + 1].debut - airAvant(p[de - 1]), morceau, false, p[de - 1], p[a + 1]);
            }
            e = f + 1;
        }
    }

    // Les silences, partout ailleurs — y compris autour d'une improvisation
    // qu'on garde : la garder ne veut pas dire garder le vide qui l'entoure. La
    // fin improvisée (v2.29) se dérushe comme le reste.
    const etendues: Array<[number, number]> = [[retenus[0], retenus[retenus.length - 1]]];
    if (calage.finImprovisee) etendues.push([calage.finImprovisee.premier, calage.finImprovisee.dernier]);
    for (const [premier, dernier] of etendues) {
        for (let g = premier; g < dernier; g++) {
            if (couverts.has(g)) continue;
            if (p[g + 1].debut - p[g].fin > SILENCE_MAX) {
                proposer('silence', p[g].fin + airApres(p[g]), p[g + 1].debut - airAvant(p[g]), '', true, p[g], p[g + 1]);
            }
        }
    }

    return coupes.sort((a, b) => a.debut - b.debut);
}

/**
 * Les choix de Florent sur une prise, dans un seul objet (rangé en base tel
 * quel, §12.5.2 et §12.5.5) :
 * - `s12.4`, `r33.0`, `h41.7` → `true` coupe, `false` garde une coupe proposée ;
 * - `m12.30-14.85` → `true` coupe, `false` garde un passage choisi à la main ;
 * - `p7` → la version imposée pour la phrase 7 : son début, en secondes.
 * Absent, tout suit son défaut.
 */
export type ChoixDesCoupes = Record<string, boolean | number>;

/**
 * Le choix qui vaut pour une coupe. Une nouvelle transcription de la même
 * prise peut décaler un bord de quelques centièmes : un choix retrouve sa coupe
 * à trois dixièmes près, pourvu que le motif soit le même.
 */
export function estCoupee(coupe: CoupeProposee, choix: ChoixDesCoupes | undefined): boolean {
    if (!choix) return coupe.parDefaut;
    if (typeof choix[coupe.cle] === 'boolean') return choix[coupe.cle] as boolean;
    const prefixe = MOTIFS[coupe.motif];
    for (const [cle, valeur] of Object.entries(choix)) {
        if (typeof valeur === 'boolean' && cle[0] === prefixe && Math.abs(Number(cle.slice(1)) - coupe.debut) <= 0.3) return valeur;
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
    // Le dernier geste l'emporte : un passage tranché à la main sur cette coupe s'efface aussi.
    const manuel = (cle: string) => {
        const m = /^m(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(cle);
        return !!m && Number(m[2]) > coupe.debut && Number(m[1]) < coupe.fin;
    };
    const suite = Object.fromEntries(Object.entries(choix ?? {}).filter(([cle]) =>
        cle !== coupe.cle && !manuel(cle) && !(cle[0] === prefixe && Math.abs(Number(cle.slice(1)) - coupe.debut) <= 0.3)));
    if (coupee !== coupe.parDefaut) suite[coupe.cle] = coupee;
    return suite;
}

/** Des intervalles triés, ceux qui se touchent ou se chevauchent réunis. */
export const fusionnerIntervalles = (intervalles: Intervalle[]): Intervalle[] => {
    const fusion: Intervalle[] = [];
    for (const c of [...intervalles].sort((a, b) => a.debut - b.debut)) {
        const derniere = fusion[fusion.length - 1];
        if (derniere && c.debut <= derniere.fin) derniere.fin = Math.max(derniere.fin, c.fin);
        else fusion.push({ ...c });
    }
    return fusion;
};

/** `a` privé de `b` : ce qui reste de chaque intervalle de `a` hors de ceux de `b`. */
const retirer = (a: Intervalle[], b: Intervalle[]): Intervalle[] => a.flatMap(x => {
    let morceaux = [x];
    for (const y of b) {
        morceaux = morceaux.flatMap(m => y.fin <= m.debut || y.debut >= m.fin ? [m] : [
            ...(y.debut > m.debut ? [{ debut: m.debut, fin: y.debut }] : []),
            ...(y.fin < m.fin ? [{ debut: y.fin, fin: m.fin }] : []),
        ]);
    }
    return morceaux;
});

/** Les passages tranchés à la main (`m…`), dans l'ordre. */
export function passagesManuels(choix: ChoixDesCoupes | undefined): Array<Intervalle & { coupe: boolean; cle: string }> {
    return Object.entries(choix ?? {}).flatMap(([cle, valeur]) => {
        const m = /^m(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(cle);
        return m && typeof valeur === 'boolean' ? [{ debut: Number(m[1]), fin: Number(m[2]), coupe: valeur, cle }] : [];
    }).sort((a, b) => a.debut - b.debut);
}

/** Les versions imposées (`p…`) : rang de phrase → début de la version, en secondes dans la prise. */
export function versionsImposees(choix: ChoixDesCoupes | undefined): Record<number, number> {
    return Object.fromEntries(Object.entries(choix ?? {}).flatMap(([cle, valeur]) => {
        const m = /^p(\d+)$/.exec(cle);
        return m && typeof valeur === 'number' ? [[Number(m[1]), valeur]] : [];
    }));
}

/**
 * Les intervalles à retirer de la prise, triés et fusionnés : c'est ce que le
 * plan de montage attend. Les coupes proposées et tranchées, plus les passages
 * coupés à la main, moins ceux rétablis à la main — la main a le dernier mot.
 */
export function coupesAppliquees(proposees: CoupeProposee[], choix: ChoixDesCoupes | undefined): Intervalle[] {
    const manuels = passagesManuels(choix);
    const auto = proposees.filter(c => estCoupee(c, choix)).map(c => ({ debut: c.debut, fin: c.fin }));
    const coupes = fusionnerIntervalles([...auto, ...manuels.filter(m => m.coupe)]);
    return fusionnerIntervalles(retirer(coupes, manuels.filter(m => !m.coupe)));
}

/** Un passage tranché à la main, et la coupe proposée qu'il recouvre presque entièrement, s'il y en a une. */
const recouvre = (passage: Intervalle, coupe: Intervalle) => {
    const commun = Math.max(0, Math.min(passage.fin, coupe.fin) - Math.max(passage.debut, coupe.debut));
    return commun >= 0.9 * (coupe.fin - coupe.debut) && commun >= 0.5 * (passage.fin - passage.debut);
};

/** Un reste plus court n'est que de l'air autour des mots : il ne mérite pas sa clé. */
const RESTE_MIN = 0.3;

const cleManuelle = (debut: number, fin: number) => `m${debut.toFixed(2)}-${fin.toFixed(2)}`;

/**
 * Le choix suivant, une fois un passage tranché à la main dans le montage par
 * le texte. S'il correspond à une coupe proposée, c'est elle qu'on tranche :
 * le choix reste lisible, et suit la coupe si une transcription la décale. Sinon
 * un passage manuel s'ajoute, et remplace ceux qu'il englobe.
 *
 * **Le dernier geste l'emporte** (corrigé le 27/10/2026). Un passage rétabli
 * l'emporte sur toute coupe dans `coupesAppliquees` : recouper une partie de ce
 * qu'on venait de rétablir n'avait donc aucun effet, et « se raviser d'un clic »
 * ne marchait pas. Un passage manuel de sens contraire que le nouveau chevauche
 * ne garde que ce qui en dépasse.
 */
export function trancherUnPassage(
    choix: ChoixDesCoupes | undefined,
    passage: Intervalle,
    coupe: boolean,
    proposees: CoupeProposee[],
): ChoixDesCoupes {
    const proposee = proposees.find(c => recouvre(passage, c));
    if (proposee) return choisir(choix, proposee, coupe);
    const suite: ChoixDesCoupes = {};
    for (const [cle, valeur] of Object.entries(choix ?? {})) {
        const m = passagesManuels({ [cle]: valeur })[0];
        if (!m) { suite[cle] = valeur; continue; }
        // Englobé par le nouveau passage : il disparaît.
        if (m.debut >= passage.debut && m.fin <= passage.fin) continue;
        const chevauche = m.fin > passage.debut && m.debut < passage.fin;
        if (chevauche && m.coupe !== coupe) {
            if (passage.debut - m.debut >= RESTE_MIN) suite[cleManuelle(m.debut, passage.debut)] = m.coupe;
            if (m.fin - passage.fin >= RESTE_MIN) suite[cleManuelle(passage.fin, m.fin)] = m.coupe;
            continue;
        }
        suite[cle] = valeur;
    }
    suite[cleManuelle(passage.debut, passage.fin)] = coupe;
    return suite;
}

/** Le temps que les coupes retirent, en secondes. */
export const dureeCoupee = (coupes: Intervalle[]): number =>
    coupes.reduce((s, c) => s + (c.fin - c.debut), 0);
