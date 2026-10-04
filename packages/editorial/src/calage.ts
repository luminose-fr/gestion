/**
 * Le calage d'un Reel expliqué sur sa prise (SPEC §12.5) et le plan de montage
 * qui en découle (§12.6, V4).
 *
 * Whisper rend ce qui a été DIT, mot à mot et horodaté ; le script dit ce qui
 * DEVAIT l'être. Aligner les deux donne, pour chaque mot du script, l'instant
 * où il est prononcé — c'est l'horloge que `minuterReel` attendait. Rien de ce
 * qui a été écrit pour l'aperçu ne change : on remplace une horloge par une
 * autre.
 *
 * Calcul pur, sans dépendance : il se teste sans réseau ni navigateur, et la
 * découpe en mots est CELLE du contrôle (`motsSitues`) — un repère que le
 * storyboard trouve, le calage le trouve aussi.
 */
import { motsSitues, minuterReel, type Horloge, type MinutageReel, type ReelExplique } from './reelExplique';

/** Un mot prononcé, en secondes depuis le début du fichier (la forme que rend la transcription). */
export interface MotPrononce {
    mot: string;
    debut: number;
    fin: number;
}

/** Ce qu'on affiche en sous-titre : le mot du script quand il a été dit, celui de Whisper sinon. */
export interface MotAffiche {
    texte: string;
    debut: number;
    fin: number;
}

/** Un mot moyen, quand il faut en supposer un : 150 mots par minute. */
const DUREE_DU_MOT = 0.4;

// ── Comparer deux mots ───────────────────────────────────────────────

/** Distance d'édition, arrêtée dès qu'elle dépasse `plafond` : seule la proximité nous intéresse. */
function distance(a: string, b: string, plafond: number): number {
    if (Math.abs(a.length - b.length) > plafond) return plafond + 1;
    let precedente = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const courante = [i];
        let minimum = i;
        for (let j = 1; j <= b.length; j++) {
            courante[j] = Math.min(
                precedente[j] + 1,
                courante[j - 1] + 1,
                precedente[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
            minimum = Math.min(minimum, courante[j]);
        }
        if (minimum > plafond) return plafond + 1;
        precedente = courante;
    }
    return precedente[b.length];
}

type Accord = 'exact' | 'proche' | 'substitution';

/**
 * Deux mots se valent-ils ? Whisper écrit parfois de travers ce qu'il a bien
 * entendu — un nom propre, une marque, « luminose » devenu « luminoz » : à une
 * ou deux lettres près sur un mot assez long, c'est le même mot. Pas sur un
 * mot court : « tout » et « bout » ne sont pas le même mot, et un mot mal
 * entendu garde d'ordinaire sa première lettre.
 */
function accord(script: string, prise: string): Accord {
    if (script === prise) return 'exact';
    const longueur = Math.min(script.length, prise.length);
    if (longueur < 5 || script[0] !== prise[0]) return 'substitution';
    const tolerance = longueur >= 7 ? 2 : 1;
    return distance(script, prise, tolerance) <= tolerance ? 'proche' : 'substitution';
}

const SCORE: Record<Accord, number> = { exact: 3, proche: 2, substitution: -1 };
const TROU = -1;

/**
 * Alignement global (Needleman–Wunsch) du script sur la prise. Pour chaque mot
 * du script : le mot de la prise qui lui répond, et comment, ou `null` s'il n'a
 * pas été dit. L'ordre est préservé — une prise ne se lit pas dans le désordre.
 *
 * Une substitution compte comme une correspondance de POSITION : un mot mal
 * entendu reste à sa place dans le temps, et c'est sa place qui nous sert.
 */
export function aligner(script: string[], prise: string[]): Array<{ j: number; accord: Accord } | null> {
    const n = script.length;
    const m = prise.length;
    const largeur = m + 1;
    const score = new Float64Array((n + 1) * largeur);
    // 0 : diagonale, 1 : mot du script sauté, 2 : mot de la prise sauté.
    const venue = new Uint8Array((n + 1) * largeur);
    for (let i = 1; i <= n; i++) { score[i * largeur] = i * TROU; venue[i * largeur] = 1; }
    for (let j = 1; j <= m; j++) { score[j] = j * TROU; venue[j] = 2; }

    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            const diagonale = score[(i - 1) * largeur + j - 1] + SCORE[accord(script[i - 1], prise[j - 1])];
            const saute = score[(i - 1) * largeur + j] + TROU;
            const ajoute = score[i * largeur + j - 1] + TROU;
            const k = i * largeur + j;
            if (diagonale >= saute && diagonale >= ajoute) { score[k] = diagonale; venue[k] = 0; }
            else if (saute >= ajoute) { score[k] = saute; venue[k] = 1; }
            else { score[k] = ajoute; venue[k] = 2; }
        }
    }

    const resultat: Array<{ j: number; accord: Accord } | null> = new Array(n).fill(null);
    let i = n;
    let j = m;
    while (i > 0 && j > 0) {
        const d = venue[i * largeur + j];
        if (d === 0) { resultat[i - 1] = { j: j - 1, accord: accord(script[i - 1], prise[j - 1]) }; i--; j--; }
        else if (d === 1) i--;
        else j--;
    }
    return resultat;
}

// ── Caler ────────────────────────────────────────────────────────────

interface Jeton { mot: string; debut: number; fin: number; source: number }

/**
 * Les mots de Whisper découpés comme ceux du script : « l'envoyer » donne deux
 * jetons, qui se partagent la durée du mot au prorata des lettres.
 */
function jetonsDeLaPrise(mots: MotPrononce[]): Jeton[] {
    const jetons: Jeton[] = [];
    mots.forEach((m, source) => {
        const parts = motsSitues(m.mot);
        const lettres = parts.reduce((n, p) => n + p.mot.length, 0) || 1;
        let t = m.debut;
        for (const p of parts) {
            const d = (m.fin - m.debut) * (p.mot.length / lettres);
            jetons.push({ mot: p.mot, debut: t, fin: t + d, source });
            t += d;
        }
    });
    return jetons;
}

export interface Calage {
    /** Rang d'un mot du script → instant où il est dit. Celle qu'attend `minuterReel`. */
    horloge: Horloge;
    /** Part des mots du script retrouvés dans la prise, tels quels ou à une lettre près. */
    couverture: number;
    /** L'instant de chaque mot du script — mesuré quand il a été entendu, interpolé sinon. */
    instants: number[];
    mesures: boolean[];
    /** La fin du dernier mot du script. */
    fin: number;
    /** Ce qui a été dit, mot à mot, dans l'orthographe du script quand c'en est. */
    motsAffiches: MotAffiche[];
}

/** La ponctuation qui se lit dans un sous-titre : une question, une exclamation, des points de suspension. */
const PONCTUATION_LUE = /^[\s ]*([?!…])/;

/**
 * Cale le texte d'un script sur les mots d'une prise. `texte` est la voix
 * entière, séquences mises bout à bout dans l'ordre — la même suite de mots que
 * celle dont `minuterReel` compte les rangs.
 */
export function calerSurLaPrise(texte: string, mots: MotPrononce[]): Calage {
    const script = motsSitues(texte);
    const jetons = jetonsDeLaPrise(mots);
    const alignement = aligner(script.map(s => s.mot), jetons.map(j => j.mot));

    const instants = new Array<number>(script.length).fill(NaN);
    const mesures = new Array<boolean>(script.length).fill(false);
    alignement.forEach((a, i) => {
        if (!a) return;
        instants[i] = jetons[a.j].debut;
        mesures[i] = true;
    });

    // Ce qui n'a pas été entendu prend sa place entre deux mots qui l'ont été,
    // au prorata des rangs ; aux bords, au débit moyen.
    const connus = instants.flatMap((t, i) => Number.isNaN(t) ? [] : [i]);
    if (connus.length === 0) {
        instants.forEach((_, i) => { instants[i] = i * DUREE_DU_MOT; });
    } else {
        for (let i = 0; i < instants.length; i++) {
            if (!Number.isNaN(instants[i])) continue;
            const avant = connus.filter(k => k < i).pop();
            const apres = connus.find(k => k > i);
            if (avant !== undefined && apres !== undefined) {
                instants[i] = instants[avant] + (instants[apres] - instants[avant]) * ((i - avant) / (apres - avant));
            } else if (apres !== undefined) {
                instants[i] = Math.max(0, instants[apres] - (apres - i) * DUREE_DU_MOT);
            } else {
                instants[i] = instants[avant!] + (i - avant!) * DUREE_DU_MOT;
            }
        }
    }

    const dernier = alignement[alignement.length - 1];
    const fin = dernier ? jetons[dernier.j].fin
        : instants.length ? instants[instants.length - 1] + DUREE_DU_MOT : 0;

    const retrouves = alignement.filter(a => a && a.accord !== 'substitution').length;

    // Les sous-titres : chaque mot dit, dans l'orthographe du script quand tous
    // ses morceaux y répondent, d'un seul tenant ; tel que Whisper l'a écrit sinon.
    const scriptDuJeton = new Map<number, number>();
    alignement.forEach((a, i) => { if (a && a.accord !== 'substitution') scriptDuJeton.set(a.j, i); });
    const motsAffiches: MotAffiche[] = [];
    mots.forEach((m, source) => {
        const indices = jetons.flatMap((j, k) => j.source === source ? [k] : []);
        // Un « ? » que Whisper rend seul rejoint le mot qu'il ponctue : seul à
        // l'écran, il ne se lirait pas.
        if (indices.length === 0) {
            const precedent = motsAffiches[motsAffiches.length - 1];
            const signe = m.mot.trim().match(/[?!…]/)?.[0];
            if (precedent) {
                if (signe && !precedent.texte.endsWith(signe)) precedent.texte += `\u00A0${signe}`;
                precedent.fin = Math.max(precedent.fin, m.fin);
            }
            return;
        }
        const rangs = indices.map(k => scriptDuJeton.get(k));
        const suivis = rangs.every((r, x) => r !== undefined && (x === 0 || r === rangs[x - 1]! + 1));
        if (!suivis) {
            motsAffiches.push({ texte: m.mot.trim(), debut: m.debut, fin: m.fin });
            return;
        }
        const premier = script[rangs[0]!];
        const ultime = script[rangs[rangs.length - 1]!];
        const ponctuation = texte.slice(ultime.fin).match(PONCTUATION_LUE)?.[1] ?? '';
        motsAffiches.push({
            texte: texte.slice(premier.debut, ultime.fin) + (ponctuation ? `\u00A0${ponctuation}` : ''),
            debut: m.debut,
            fin: m.fin,
        });
    });

    return {
        horloge: rang => rang < instants.length ? instants[rang] : fin,
        couverture: script.length ? retrouves / script.length : 0,
        instants,
        mesures,
        fin,
        motsAffiches,
    };
}

/** La voix entière d'un Reel expliqué, dans l'ordre : ce sur quoi se cale la prise principale. */
export const voixEntiere = (data: ReelExplique): string =>
    (data.sequences ?? []).map(s => s.voix ?? '').join('\n');

// ── Sous-titres ──────────────────────────────────────────────────────

export interface SousTitre {
    texte: string;
    debut: number;
    fin: number;
}

/**
 * Les mots en blocs de sous-titres, comme l'outil Sous-titres : quatre mots au
 * plus, coupés plus tôt à une fin de phrase ou à un silence — un bloc ne doit
 * pas enjamber une respiration.
 */
export function enBlocs(mots: MotAffiche[], motsParBloc = 4): SousTitre[] {
    const blocs: SousTitre[] = [];
    let courant: MotAffiche[] = [];
    const fermer = () => {
        if (courant.length === 0) return;
        blocs.push({ texte: courant.map(m => m.texte).join(' '), debut: courant[0].debut, fin: courant[courant.length - 1].fin });
        courant = [];
    };
    mots.forEach((m, i) => {
        const precedent = mots[i - 1];
        if (precedent && m.debut - precedent.fin > 0.6) fermer();
        courant.push(m);
        if (courant.length >= motsParBloc || /[.?!…]$/.test(m.texte)) fermer();
    });
    fermer();
    // Un bloc reste à l'écran jusqu'au suivant quand l'écart est court : un
    // sous-titre qui clignote entre deux mots se lit mal.
    blocs.forEach((b, i) => {
        const suivant = blocs[i + 1];
        if (suivant && suivant.debut - b.fin < 0.3) b.fin = suivant.debut;
    });
    return blocs;
}

// ── Le plan de montage (V4) ──────────────────────────────────────────

export interface PriseCalee {
    calage: Calage;
    /** Durée du fichier, en secondes. */
    duree: number;
}

export interface SegmentVideo {
    source: 'principale' | 'accroche';
    /** Dans le fichier source, en secondes. */
    depuis: number;
    jusqua: number;
    /** Dans la vidéo produite, en secondes. */
    a: number;
}

export interface PlanDeMontage {
    duree: number;
    segments: SegmentVideo[];
    /** Les séquences et leurs apparitions, en temps de la vidéo produite. */
    minutage: MinutageReel;
    /** Sur les passages face caméra seulement : sur une scène, l'écran ne transcrit pas (§12.1). */
    sousTitres: SousTitre[];
}

/** Le silence qu'on garde avant le premier mot et après le dernier : assez pour respirer, pas pour attendre. */
const AIR_AVANT = 0.3;
const AIR_APRES = 0.6;

/** Un repère corrigé à la main, en secondes dans la prise principale, par `séquence:élément`. */
export type ReperesCorriges = Record<string, number>;

const decaler = (minutage: MinutageReel, delta: number): MinutageReel => ({
    duree: minutage.duree + delta,
    sequences: minutage.sequences.map(s => ({ ...s, debut: s.debut + delta, fin: s.fin + delta })),
});

/** Les sous-titres d'un intervalle de la prise, rognés aux passages face caméra. */
function sousTitresCamera(blocs: SousTitre[], minutage: MinutageReel, data: ReelExplique): SousTitre[] {
    const cameras = minutage.sequences.filter((_, i) => data.sequences[i]?.plan === 'camera');
    return blocs.flatMap(b => {
        const milieu = (b.debut + b.fin) / 2;
        const plan = cameras.find(c => milieu >= c.debut && milieu < c.fin);
        return plan ? [{ ...b, debut: Math.max(b.debut, plan.debut), fin: Math.min(b.fin, plan.fin) }] : [];
    });
}

/**
 * Ce que la vidéo finale montre, et quand. Organique : la prise principale,
 * débarrassée de ses silences de tête et de queue. Publicité : la seconde
 * accroche, puis la prise principale reprise au premier mot de la séquence 2.
 */
export function planDeMontage(
    data: ReelExplique,
    principale: PriseCalee,
    options: { accroche?: PriseCalee | null; reperes?: ReperesCorriges } = {},
): PlanDeMontage {
    const brut = minuterReel(data, principale.calage.horloge);
    // Un repère corrigé à la main l'emporte sur le calage : c'est Florent qui a vu la vidéo.
    brut.sequences.forEach((s, i) => {
        s.apparitions = s.apparitions.map((a, j) => {
            const corrige = options.reperes?.[`${i}:${j}`];
            return corrige === undefined ? a : corrige - s.debut;
        });
    });

    const tete = Math.max(0, (brut.sequences[0]?.debut ?? 0) - AIR_AVANT);
    const queue = Math.min(principale.duree, principale.calage.fin + AIR_APRES);
    const derniere = brut.sequences[brut.sequences.length - 1];
    if (derniere) derniere.fin = queue;
    const blocs = enBlocs(principale.calage.motsAffiches);

    const accroche = options.accroche;
    if (!accroche || brut.sequences.length < 2) {
        const minutage = decaler({ ...brut, duree: queue }, -tete);
        return {
            duree: queue - tete,
            segments: [{ source: 'principale', depuis: tete, jusqua: queue, a: 0 }],
            minutage,
            sousTitres: sousTitresCamera(blocs.map(b => ({ ...b, debut: b.debut - tete, fin: b.fin - tete })), minutage, data),
        };
    }

    // La seconde accroche, calée sur son propre texte, dans son propre fichier.
    const depuis = Math.max(0, accroche.calage.horloge(0) - AIR_AVANT);
    const jusqua = Math.min(accroche.duree, accroche.calage.fin + AIR_APRES / 2);
    const longueur = jusqua - depuis;
    // On reprend la prise principale juste avant le premier mot de la séquence 2.
    const coupe = Math.max(0, brut.sequences[1].debut - 0.12);
    const suite = decaler({ ...brut, duree: queue }, longueur - coupe);
    suite.sequences[0] = { debut: 0, fin: longueur, apparitions: [] };
    // La séquence 2 commence au raccord, un peu avant son premier mot : ses
    // apparitions, comptées depuis son début, reculent d'autant pour rester
    // sur leurs mots.
    const avance = suite.sequences[1].debut - longueur;
    suite.sequences[1] = {
        ...suite.sequences[1],
        debut: longueur,
        apparitions: suite.sequences[1].apparitions.map(a => a === null ? null : a + avance),
    };

    const sousTitresAccroche = enBlocs(accroche.calage.motsAffiches)
        .filter(b => b.fin > depuis && b.debut < jusqua)
        .map(b => ({ ...b, debut: Math.max(0, b.debut - depuis), fin: Math.min(longueur, b.fin - depuis) }));
    const sousTitresSuite = sousTitresCamera(
        blocs.filter(b => b.debut >= coupe).map(b => ({ ...b, debut: b.debut - coupe + longueur, fin: b.fin - coupe + longueur })),
        suite, data,
    );

    return {
        duree: longueur + (queue - coupe),
        segments: [
            { source: 'accroche', depuis, jusqua, a: 0 },
            { source: 'principale', depuis: coupe, jusqua: queue, a: longueur },
        ],
        minutage: suite,
        sousTitres: [...sousTitresAccroche, ...sousTitresSuite],
    };
}
