/**
 * Le choix des prises, phrase par phrase (SPEC §12.5.5).
 *
 * Constaté le 25/10/2026 sur une vraie prise : aligné mot à mot sur toute la
 * vidéo, le script prenait le début d'une phrase dans une version et sa fin
 * dans une autre — « apprenez-moi à ne » (1ʳᵉ version), puis « ne plus être
 * submergé » (2ᵉ). La coupe tombait au milieu d'une phrase, entre deux
 * intonations.
 *
 * Ici, chaque phrase du script cherche toutes ses versions dans la prise, et
 * une seule est retenue, d'un seul tenant. Les coupes tombent donc entre deux
 * phrases, où elles sont naturelles.
 *
 * **La plus récente des bonnes versions l'emporte.** Quand on refait une
 * phrase, c'est d'ordinaire que la première ne convenait pas — sur la prise du
 * 25/10, la 1ʳᵉ version disait « une fatigue qui ne DÉPASSE pas », la 2ᵉ
 * corrigeait. Une version est bonne si elle retrouve au moins 60 % des mots de
 * la phrase, et pas plus de 15 points de moins que la meilleure : une version
 * abandonnée à mi-chemin ne remplace pas une version entière.
 *
 * Le choix se fait sur toute la prise à la fois (programmation dynamique) :
 * les phrases restent dans l'ordre, et prendre la dernière version d'une phrase
 * ne doit pas condamner la suivante.
 */
import { motsSitues } from './reelExplique';

export interface PhraseDuScript {
    /** Rangs des mots dans la voix entière : [premier, dernier + 1). */
    debut: number;
    fin: number;
    mots: string[];
}

/** Une phrase plus courte (« Bon. », « Sparadrap. ») se cherche avec sa voisine : seule, on la trouverait partout. */
const PHRASE_MIN = 3;

/**
 * Les phrases de la voix entière : un point, un point d'interrogation ou
 * d'exclamation suivi d'un blanc, ou le passage d'une séquence à l'autre. Pas
 * les points de suspension : « chercher… un meilleur sparadrap » est une pause
 * dans la phrase, et la couper en deux laissait entre ses moitiés des mots dits
 * qui n'appartenaient plus à rien. Une phrase de moins de trois mots rejoint la
 * précédente — la suivante si elle ouvre une séquence.
 */
export function phrasesDuScript(texte: string): PhraseDuScript[] {
    const mots = motsSitues(texte);
    const coupures: number[] = [0];
    mots.forEach((m, i) => {
        if (i === 0) return;
        const entre = texte.slice(mots[i - 1].fin, m.debut);
        if (entre.includes('\n') || (/[.?!]/.test(entre) && /\s/.test(entre))) coupures.push(i);
    });
    const brutes = coupures.map((debut, k) => ({ debut, fin: coupures[k + 1] ?? mots.length }))
        .filter(p => p.fin > p.debut);
    const fusion: Array<{ debut: number; fin: number }> = [];
    for (const p of brutes) {
        const precedente = fusion[fusion.length - 1];
        const courte = p.fin - p.debut < PHRASE_MIN;
        const ouvreUneSequence = texte.slice(mots[p.debut - 1]?.fin ?? 0, mots[p.debut].debut).includes('\n');
        if (precedente && (courte && !ouvreUneSequence || precedente.fin - precedente.debut < PHRASE_MIN && !ouvreUneSequence)) {
            precedente.fin = p.fin;
        } else fusion.push({ ...p });
    }
    return fusion.map(p => ({ ...p, mots: mots.slice(p.debut, p.fin).map(m => m.mot) }));
}

export interface Correspondance { /** Rang dans la phrase. */ i: number; /** Rang du jeton dans la prise. */ j: number; fiable: boolean }

export interface VersionDePhrase {
    /** Jetons de la prise, premier et dernier inclus. */
    debut: number;
    fin: number;
    /** Part des mots de la phrase retrouvés tels quels ou presque. */
    couverture: number;
    correspondances: Correspondance[];
}

type Accord = 'exact' | 'proche' | 'substitution';

/**
 * Le meilleur passage de la prise pour une phrase (alignement « ajusté » : la
 * phrase entière, contre un passage quelconque de la prise). `masques` sont les
 * jetons déjà pris par une autre version de la même phrase.
 */
function ajuster(
    phrase: string[], jetons: string[], masques: Set<number>, accord: (a: string, b: string) => Accord,
): VersionDePhrase | null {
    const n = phrase.length;
    const m = jetons.length;
    if (n === 0 || m === 0) return null;
    const POINTS: Record<Accord, number> = { exact: 3, proche: 2, substitution: -1 };
    const TROU = -1;
    const largeur = m + 1;
    const score = new Float64Array((n + 1) * largeur);
    const venue = new Uint8Array((n + 1) * largeur);
    // Début libre dans la prise : score[0][j] = 0.
    for (let i = 1; i <= n; i++) { score[i * largeur] = i * TROU; venue[i * largeur] = 1; }
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            const a = masques.has(j - 1) ? 'substitution' : accord(phrase[i - 1], jetons[j - 1]);
            const diagonale = score[(i - 1) * largeur + j - 1] + (masques.has(j - 1) ? -2 : POINTS[a]);
            const saute = score[(i - 1) * largeur + j] + TROU;
            const ajoute = score[i * largeur + j - 1] + (masques.has(j - 1) ? -2 : TROU);
            const k = i * largeur + j;
            if (diagonale >= saute && diagonale >= ajoute) { score[k] = diagonale; venue[k] = 0; }
            else if (saute >= ajoute) { score[k] = saute; venue[k] = 1; }
            else { score[k] = ajoute; venue[k] = 2; }
        }
    }
    // Fin libre : la meilleure fin de phrase, n'importe où dans la prise.
    let jFin = 0;
    for (let j = 1; j <= m; j++) if (score[n * largeur + j] > score[n * largeur + jFin]) jFin = j;
    const correspondances: Correspondance[] = [];
    let i = n;
    let j = jFin;
    while (i > 0 && j > 0) {
        const d = venue[i * largeur + j];
        if (d === 0) {
            const a = accord(phrase[i - 1], jetons[j - 1]);
            if (!masques.has(j - 1)) correspondances.push({ i: i - 1, j: j - 1, fiable: a !== 'substitution' });
            i--; j--;
        } else if (d === 1) i--;
        else j--;
    }
    correspondances.reverse();
    const fiables = correspondances.filter(c => c.fiable);
    if (fiables.length === 0) return null;
    // Le passage va du premier au dernier mot retrouvé : une substitution au
    // bord n'étend pas la version sur un mot qui n'en est pas.
    return {
        debut: fiables[0].j,
        fin: fiables[fiables.length - 1].j,
        couverture: fiables.length / n,
        correspondances: correspondances.filter(c => c.j >= fiables[0].j && c.j <= fiables[fiables.length - 1].j),
    };
}

/** En deçà, ce n'est plus une version de la phrase, c'est une coïncidence de mots. */
const COUVERTURE_MIN = 0.4;
/**
 * Pour qu'une version écartée soit coupée comme une reprise, il faut qu'elle en
 * soit une : 60 % de la phrase et trois mots au moins. Les versions plus maigres
 * sont des coïncidences — « c'est » trouvé dans « c'est un bassin » — et
 * couper sur elles amputait des phrases bien dites.
 */
export const estUneVraieVersion = (v: VersionDePhrase): boolean =>
    v.couverture >= 0.6 && v.correspondances.filter(c => c.fiable).length >= 3;
/** Une bonne version retrouve au moins 60 % des mots… */
const BONNE_MIN = 0.6;
/** … et pas plus de 15 points de moins que la meilleure. */
const ECART_BONNE = 0.15;
/** Une version qui s'étale sur plus que deux fois la phrase et six mots n'en est pas une : c'est un assemblage. */
const etendueMax = (n: number) => 2 * n + 6;

/**
 * Une pause de la prise compte pour un mot sauté par seconde. Plus sévère, on
 * perdait le « la » de « La… [2,5 s] vraie question » : un mot dit, puis une
 * hésitation, c'est encore la même phrase.
 */
const PAUSE = 1;
/** La marque d'une pause : aucun mot du script ne lui répond. */
const MARQUE_PAUSE = '\u2009';

export interface JetonDeLaPrise { mot: string; debut: number; fin: number }

/**
 * Les jetons de la prise, une marque glissée par seconde de silence. Une
 * version qui enjambe une longue pause paie chaque marque comme un mot sauté :
 * elle ne va pas chercher un mot isolé à dix secondes de là, dans une autre
 * tentative.
 */
function avecLesPauses(jetons: JetonDeLaPrise[]): { mots: string[]; vrai: number[] } {
    const mots: string[] = [];
    const vrai: number[] = [];
    jetons.forEach((j, k) => {
        mots.push(j.mot);
        vrai.push(k);
        const suivant = jetons[k + 1];
        const pauses = suivant ? Math.floor((suivant.debut - j.fin) / PAUSE) : 0;
        for (let p = 0; p < pauses; p++) { mots.push(MARQUE_PAUSE); vrai.push(-1); }
    });
    return { mots, vrai };
}

/** Toutes les versions d'une phrase dans la prise, de la meilleure à la moins bonne. Indices de jetons RÉELS. */
export function versionsDePhrase(phrase: string[], jetons: JetonDeLaPrise[], accord: (a: string, b: string) => Accord): VersionDePhrase[] {
    const { mots, vrai } = avecLesPauses(jetons);
    const versions: VersionDePhrase[] = [];
    const masques = new Set<number>();
    for (let essai = 0; essai < 8; essai++) {
        const v = ajuster(phrase, mots, masques, accord);
        if (!v || v.couverture < COUVERTURE_MIN) break;
        for (let j = v.debut; j <= v.fin; j++) masques.add(j);
        const reelle: VersionDePhrase = {
            debut: vrai[v.debut],
            fin: vrai[v.fin],
            couverture: v.couverture,
            correspondances: v.correspondances.filter(c => vrai[c.j] >= 0).map(c => ({ ...c, j: vrai[c.j] })),
        };
        if (reelle.fin - reelle.debut + 1 <= etendueMax(phrase.length)) versions.push(reelle);
    }
    return versions;
}

export interface PhraseChoisie {
    phrase: PhraseDuScript;
    versions: VersionDePhrase[];
    /** L'indice de la version retenue dans `versions`, ou `null` : la phrase n'a pas été dite. */
    retenue: number | null;
}

/**
 * La version retenue pour chaque phrase ; c'est l'instant de son premier mot
 * qui départage les bonnes. `imposees` porte les choix de Florent : rang de
 * phrase → début de la version voulue, en secondes dans la prise.
 */
export function choisirLesPrises(
    phrases: PhraseDuScript[],
    jetons: JetonDeLaPrise[],
    accord: (a: string, b: string) => Accord,
    imposees: Record<number, number> = {},
): PhraseChoisie[] {
    const instantDe = (j: number) => jetons[j].debut;
    const toutes = phrases.map(p => versionsDePhrase(p.mots, jetons, accord));

    // La version imposée est la plus proche de l'instant choisi, à 1,5 s près :
    // l'enveloppe peut arriver après le choix, et recaler son premier mot.
    const imposee = toutes.map((versions, s) => {
        const t = imposees[s];
        if (t === undefined || versions.length === 0) return -1;
        const ecarts = versions.map(v => Math.abs(instantDe(v.debut) - t));
        const k = ecarts.indexOf(Math.min(...ecarts));
        return ecarts[k] <= 1.5 ? k : -1;
    });

    const valeur = (s: number, v: VersionDePhrase): number => {
        if (imposee[s] >= 0 && toutes[s][imposee[s]] === v) return 1e12;
        const meilleure = Math.max(...toutes[s].map(x => x.couverture));
        const bonne = v.couverture >= Math.max(BONNE_MIN, meilleure - ECART_BONNE - 1e-9);
        // D'abord le nombre de phrases bien dites ; entre deux bonnes versions, la
        // plus récente ; à défaut de bonne, celle qui retrouve le plus de mots.
        return bonne
            ? 1e8 + instantDe(v.debut) * 100 + v.couverture
            : v.couverture * phrases[s].mots.length * 1e4;
    };

    /*
     * Une version imposée entraîne sa suite : la phrase qui la suit dans la MÊME
     * tentative, sans pause notable, est préférée aux autres bonnes versions.
     * Choisir « la première version de “Derrière la digue” », c'est choisir
     * cette tentative-là, pas une phrase isolée.
     */
    const SUITE = 1e6;
    const enchaine = (fin: number, v: VersionDePhrase) =>
        v.debut > fin && v.debut <= fin + 3 && instantDe(v.debut) - jetons[fin].fin < 2;

    // États : la dernière version retenue (rang global), ou -1 si aucune encore.
    type Etat = { score: number; parent: Etat | null; phrase: number; version: number | null; fin: number; suite: boolean };
    let etats = new Map<string, Etat>([['-1', { score: 0, parent: null, phrase: -1, version: null, fin: -1, suite: false }]]);
    toutes.forEach((versions, s) => {
        const suivants = new Map<string, Etat>();
        const garder = (cle: string, e: Etat) => {
            const actuel = suivants.get(cle);
            if (!actuel || e.score > actuel.score) suivants.set(cle, e);
        };
        for (const [cle, e] of etats) {
            garder(cle, { score: e.score, parent: e, phrase: s, version: null, fin: e.fin, suite: false });
            versions.forEach((v, k) => {
                if (v.debut <= e.fin) return;
                const imposeeIci = imposee[s] === k;
                const suite = imposeeIci || (e.suite && enchaine(e.fin, v) && valeur(s, v) >= 1e8);
                const bonus = !imposeeIci && suite ? SUITE : 0;
                garder(`${s}:${k}`, { score: e.score + valeur(s, v) + bonus, parent: e, phrase: s, version: k, fin: v.fin, suite });
            });
        }
        etats = suivants;
    });

    let meilleur: Etat | null = null;
    for (const e of etats.values()) if (!meilleur || e.score > meilleur.score) meilleur = e;
    const retenues = new Array<number | null>(phrases.length).fill(null);
    for (let e = meilleur; e && e.phrase >= 0; e = e.parent) retenues[e.phrase] = e.version;
    return phrases.map((phrase, s) => ({ phrase, versions: toutes[s], retenue: retenues[s] }));
}
