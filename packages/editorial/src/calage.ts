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
import { motsSitues, minuterReel, debutsDesEcrans, arriveesDeLaListe, schemaDe, COUP_MIN, type Horloge, type MinutageReel, type ReelExplique } from './reelExplique';
import { fusionnerIntervalles, type Intervalle } from './derushage';
import { regionsDeParole, recalerSurLeSon, type Enveloppe } from './enveloppe';
import { phrasesDuScript, choisirLesPrises, estUneVraieVersion, type PhraseChoisie } from './selection';
import { HESITATIONS } from './directe';

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
    /**
     * La ponctuation qui le suit dans le script — ou chez Whisper, hors du script.
     * Elle ne s'affiche pas (un sous-titre n'a ni point ni virgule), mais elle dit
     * où un bloc se coupe le mieux.
     */
    coupure?: 'phrase' | 'virgule';
    /**
     * Il répond au premier mot d'une phrase — ou d'une séquence — du script. Le
     * mot d'avant en ferme donc une, même quand rien ne le ponctue : « s'il vous
     * plaît », improvisé, ne portait pas de point, et le sous-titre écrivait
     * « s'il vous plaît En » (export du 30/10/2026).
     */
    ouvre?: boolean;
}

/** Ce qui suit un mot : une fin de phrase, une virgule, ou rien qui coupe. */
const coupureApres = (suite: string): MotAffiche['coupure'] => {
    const signe = suite.match(/^[\s\u00A0»"”)]*([.?!…,;:])/)?.[1];
    return !signe ? undefined : /[.?!…]/.test(signe) ? 'phrase' : 'virgule';
};

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

export type Accord = 'exact' | 'proche' | 'substitution';

/**
 * Deux mots se valent-ils ? Whisper écrit parfois de travers ce qu'il a bien
 * entendu — un nom propre, une marque, « luminose » devenu « luminoz » : à une
 * ou deux lettres près sur un mot assez long, c'est le même mot. Pas sur un
 * mot court : « tout » et « bout » ne sont pas le même mot, et un mot mal
 * entendu garde d'ordinaire sa première lettre.
 */
export function accord(script: string, prise: string): Accord {
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

/**
 * Un mot dit, et ce que le script en fait. C'est ce que lit le dérushage
 * (SPEC §12.5.2) : un mot dit qui ne répond à aucun mot du script est une
 * reprise ou une improvisation — candidat à la coupe.
 */
export interface Prononce {
    /** Normalisé, comme ceux du script. */
    mot: string;
    debut: number;
    fin: number;
    /** Le rang du mot du script auquel il répond, ou `null`. */
    rang: number | null;
    /** Le mot tel que Whisper l'a écrit, sur le premier morceau d'un mot coupé en deux ; vide sur les suivants. */
    ecrit: string;
    /** Il appartient à une version d'une phrase du script qui n'a pas été retenue (§12.5.5). */
    autrePrise?: boolean;
    /**
     * Il ouvre, dans le même souffle, la version retenue d'une phrase REFORMULÉE :
     * « Bonjour, moi ce que | je voudrais, c'est mieux gérer mes émotions ».
     * Il part avec elle, jamais avec la reprise qui la précède (§12.5.5, v2.29).
     */
    amorce?: boolean;
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
    /** Chaque mot dit, dans l'ordre de la prise, avec le mot du script qui lui répond. */
    prononces: Prononce[];
    /** Les passages où l'on parle, lus dans le son (§12.5.4) ; absents sans enveloppe. */
    parole?: Intervalle[];
    enveloppe?: Enveloppe;
    /** Chaque phrase du script, ses versions dans la prise, et celle qui a été retenue (§12.5.5). */
    phrases: PhraseChoisie[];
    /**
     * La fin improvisée (v2.29) : quand la dernière phrase du script n'a jamais
     * été dite, la dernière tentative dite après le dernier mot du script — en
     * secondes de la prise, et ses jetons, premier et dernier inclus.
     */
    finImprovisee?: Intervalle & { premier: number; dernier: number };
}

/**
 * En deçà, une version retenue n'est plus la phrase du script dite presque mot
 * pour mot : c'est une reformulation, et elle commence avec sa phrase.
 */
const REFORMULATION = 0.8;
/** Une amorce est un début de phrase, pas une tirade : au-delà, on ne remonte plus. */
const AMORCE_MAX = 6;
/** Plus long, l'écart entre deux mots est une respiration : ce qui précède n'est plus la même phrase. */
const SOUFFLE = 0.5;
/** Une fin improvisée dit quelque chose : « bon, ok » n'en est pas une. */
const FIN_IMPROVISEE_MIN = 5;
/** Un blanc assez long pour qu'un changement de plan y tombe sans couper un mot. */
const RESPIRATION = 0.25;

/** La ponctuation qui se lit dans un sous-titre : une question, une exclamation, des points de suspension. */
const PONCTUATION_LUE = /^[\s ]*([?!…])/;

/**
 * Cale le texte d'un script sur les mots d'une prise. `texte` est la voix
 * entière, séquences mises bout à bout dans l'ordre — la même suite de mots que
 * celle dont `minuterReel` compte les rangs.
 *
 * Avec l'enveloppe sonore, les mots de Whisper sont d'abord recalés sur la voix
 * (§12.5.4) : tout ce qui suit — instants, sous-titres, dérushage — en hérite.
 */
export function calerSurLaPrise(
    texte: string,
    motsDeWhisper: MotPrononce[],
    enveloppe?: Enveloppe | null,
    options: {
        /** Les versions imposées par Florent : rang de phrase → début de la version, en secondes dans la prise. */
        prises?: Record<number, number>;
    } = {},
): Calage {
    const parole = enveloppe ? regionsDeParole(enveloppe) : undefined;
    const mots = parole ? recalerSurLeSon(motsDeWhisper, parole) : motsDeWhisper;
    const script = motsSitues(texte);
    const jetons = jetonsDeLaPrise(mots);

    // Phrase par phrase, une seule version de chacune (§12.5.5) : l'alignement
    // de chaque phrase se fait dans sa version retenue, d'un seul tenant.
    const phrases = choisirLesPrises(phrasesDuScript(texte), jetons, accord, options.prises);
    const alignement: Array<{ j: number; accord: Accord } | null> = new Array(script.length).fill(null);
    const autres = new Set<number>();
    for (const c of phrases) {
        c.versions.forEach((v, k) => {
            if (k === c.retenue) {
                for (const m of v.correspondances) {
                    alignement[c.phrase.debut + m.i] = { j: m.j, accord: accord(script[c.phrase.debut + m.i].mot, jetons[m.j].mot) };
                }
            } else if (estUneVraieVersion(v)) for (let j = v.debut; j <= v.fin; j++) autres.add(j);
        });
    }

    // Aux deux bouts, une substitution n'est pas une preuve : quand la fin du
    // script n'a pas été dite (« luminose.fr » oublié), l'alignement l'accroche
    // au premier bruit venu — un « ok », un « Merci » — et la vidéo s'étirerait
    // jusqu'à lui. Seul un mot retrouvé tel quel, ou presque, borne la prise.
    const fiable = (a: (typeof alignement)[number]) => !!a && a.accord !== 'substitution';
    const premierFiable = alignement.findIndex(fiable);
    const dernierFiable = alignement.length - 1 - [...alignement].reverse().findIndex(fiable);
    alignement.forEach((a, i) => {
        if (a && !fiable(a) && (premierFiable < 0 || i < premierFiable || i > dernierFiable)) alignement[i] = null;
    });

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

    // La fin de la prise est celle du dernier mot du script RETROUVÉ : des mots
    // de fin jamais dits ne doivent pas l'étirer d'autant de durées supposées.
    const dernier = [...alignement].reverse().find(a => a);
    const fin = dernier ? jetons[dernier.j].fin
        : instants.length ? instants[instants.length - 1] + DUREE_DU_MOT : 0;

    const retrouves = alignement.filter(a => a && a.accord !== 'substitution').length;
    const alignes = new Set(alignement.flatMap(a => a ? [a.j] : []));

    /*
     * Une reformulation commence avec sa phrase (v2.29). Le 30/10/2026, l'accroche
     * a été dite deux fois, autrement : « Je veux mieux gérer mes émotions, s'il
     * vous plaît », puis « Bonjour, moi ce que je voudrais, c'est mieux gérer mes
     * émotions ». Retenue, la seconde commençait à « je », premier mot qui répond
     * au script, et la vidéo s'ouvrait sur « je voudrais, c'est mieux gérer… ».
     * Ce qui précède une reformulation, depuis la dernière respiration, en fait
     * partie. Rien sans respiration : « …plus forte en rebouchant tous les
     * trous, c'est apprendre » enchaîne deux phrases, et la fin de la première
     * n'amorce pas la seconde. Rien non plus devant une version dite presque mot
     * pour mot : « s'il vous plaît | apprenez-moi » reste dehors, comme la
     * §12.5.5 le veut.
     */
    const amorces = new Set<number>();
    for (const c of phrases) {
        const v = c.retenue === null ? null : c.versions[c.retenue];
        if (!v || v.couverture >= REFORMULATION) continue;
        const candidats: number[] = [];
        let respire = false;
        for (let j = v.debut - 1; j >= -1 && candidats.length <= AMORCE_MAX; j--) {
            if (j < 0 || jetons[j + 1].debut - jetons[j].fin > SOUFFLE) { respire = true; break; }
            if (alignes.has(j) || autres.has(j) || HESITATIONS.has(jetons[j].mot)) break;
            candidats.push(j);
        }
        if (respire && candidats.length <= AMORCE_MAX) candidats.forEach(j => amorces.add(j));
    }

    /*
     * La fin improvisée (v2.29). Le 30/10/2026, l'appel à l'action n'a jamais été
     * dit tel qu'écrit : Florent l'a improvisé cinq fois, la dernière étant la
     * bonne. Rien n'y répondait au script, et la vidéo s'arrêtait net sur la
     * phrase d'avant. Quand la dernière phrase du script n'a pas été dite, la
     * dernière tentative qui suit le dernier mot du script la remplace — les
     * précédentes restent dehors : quand on refait, c'est que l'essai d'avant
     * ne convenait pas.
     */
    let finImprovisee: Calage['finImprovisee'];
    const dernierAligne = Math.max(-1, ...alignes);
    if (phrases.length > 0 && phrases[phrases.length - 1].retenue === null && dernierAligne >= 0) {
        let premier = -1;
        for (let k = dernierAligne + 1; k < jetons.length; k++) {
            const nouvelle = k === dernierAligne + 1 || jetons[k].debut - jetons[k - 1].fin > PAUSE_ENTRE_TENTATIVES;
            if (nouvelle) premier = k;
            const fin = k + 1 === jetons.length || jetons[k + 1].debut - jetons[k].fin > PAUSE_ENTRE_TENTATIVES;
            if (fin && k - premier + 1 >= FIN_IMPROVISEE_MIN) {
                finImprovisee = { debut: jetons[premier].debut, fin: jetons[k].fin, premier, dernier: k };
            }
        }
    }

    // Les premiers mots des phrases et des séquences du script : un sous-titre ne les enjambe pas.
    const ouvrants = new Set(script.flatMap((m, i) => {
        const entre = i > 0 ? texte.slice(script[i - 1].fin, m.debut) : '\n';
        return entre.includes('\n') || (/[.?!…]/.test(entre) && /\s/.test(entre)) ? [i] : [];
    }));

    // Les sous-titres : chaque mot dit, dans l'orthographe du script quand tous
    // ses morceaux y répondent, d'un seul tenant ; tel que Whisper l'a écrit sinon.
    const scriptDuJeton = new Map<number, number>();
    alignement.forEach((a, i) => { if (a && a.accord !== 'substitution') scriptDuJeton.set(a.j, i); });
    const motsAffiches: MotAffiche[] = [];
    // Le dernier mot du script de chaque mot affiché, pour savoir si le suivant s'y soude.
    const dernierRang: Array<number | null> = [];
    /**
     * Whisper rend une élision en deux mots — « c », puis « 'est » — et détache
     * le trait d'union (« voulez », « -vous »). Le sous-titre écrivait « c est »,
     * et coupait parfois le bloc entre les deux : « Le jour où c / est trop
     * lourd c / est là que je », qui se lit comme un sous-titre en retard. Un mot
     * se soude au précédent quand le script les écrit sans blanc entre eux, ou,
     * hors du script, quand Whisper le fait commencer par l'apostrophe.
     */
    const souder = (affiche: string, brut: string, rang: number | null, fin: number, coupure: MotAffiche['coupure']): boolean => {
        const precedent = motsAffiches[motsAffiches.length - 1];
        if (!precedent) return false;
        const avant = dernierRang[dernierRang.length - 1];
        const entre = rang !== null && avant !== null && avant === rang - 1
            ? texte.slice(script[avant].fin, script[rang].debut)
            : null;
        const detache = /^['’‘-]/.test(brut);
        if (entre !== null ? (entre === '' || /\s/.test(entre)) : !detache) return false;
        precedent.texte += (entre ?? (/^['’‘-]/.test(affiche) ? '' : brut[0])) + affiche;
        precedent.fin = fin;
        precedent.coupure = coupure;
        dernierRang[dernierRang.length - 1] = rang;
        return true;
    };
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
        const brut = m.mot.trim();
        if (!suivis) {
            const coupure = coupureApres(brut.match(/[.?!…,;:]*$/)?.[0] ?? '');
            if (souder(brut, brut, null, m.fin, coupure)) return;
            motsAffiches.push({ texte: brut, debut: m.debut, fin: m.fin, ...(coupure ? { coupure } : {}) });
            dernierRang.push(null);
            return;
        }
        const premier = script[rangs[0]!];
        const ultime = script[rangs[rangs.length - 1]!];
        const ponctuation = texte.slice(ultime.fin).match(PONCTUATION_LUE)?.[1] ?? '';
        const affiche = texte.slice(premier.debut, ultime.fin) + (ponctuation ? `\u00A0${ponctuation}` : '');
        const coupure = coupureApres(texte.slice(ultime.fin));
        if (souder(affiche, brut, rangs[0]!, m.fin, coupure)) {
            dernierRang[dernierRang.length - 1] = rangs[rangs.length - 1]!;
            return;
        }
        motsAffiches.push({ texte: affiche, debut: m.debut, fin: m.fin, ...(coupure ? { coupure } : {}), ...(ouvrants.has(rangs[0]!) ? { ouvre: true } : {}) });
        dernierRang.push(rangs[rangs.length - 1]!);
    });

    const rangDuJeton = new Map<number, number>();
    alignement.forEach((a, i) => { if (a) rangDuJeton.set(a.j, i); });
    const prononces: Prononce[] = jetons.map((j, k) => ({
        mot: j.mot,
        debut: j.debut,
        fin: j.fin,
        rang: rangDuJeton.get(k) ?? null,
        ecrit: k > 0 && jetons[k - 1].source === j.source ? '' : mots[j.source].mot.trim(),
        ...(autres.has(k) && !rangDuJeton.has(k) ? { autrePrise: true } : {}),
        ...(amorces.has(k) ? { amorce: true } : {}),
    }));

    return {
        horloge: rang => rang < instants.length ? instants[rang] : fin,
        couverture: script.length ? retrouves / script.length : 0,
        instants,
        mesures,
        fin,
        motsAffiches,
        prononces,
        phrases,
        ...(finImprovisee ? { finImprovisee } : {}),
        ...(parole ? { parole, enveloppe: enveloppe! } : {}),
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
    /**
     * Ses mots, chacun à son instant : le mot qui se dit s'éclaire (§12.5, v2.12).
     * La plupart des vidéos courtes se regardent sans le son ; suivre la voix
     * mot à mot, c'est ce qui retient l'œil quand l'oreille est coupée.
     */
    mots: MotAffiche[];
}

/**
 * Les mots en blocs de sous-titres, comme l'outil Sous-titres : quatre mots au
 * plus, coupés plus tôt à une fin de phrase ou à un silence — un bloc ne doit
 * pas enjamber une respiration.
 *
 * Depuis le 28/10/2026, la ponctuation du script guide aussi la coupe : un bloc
 * de deux mots ou plus se ferme sur une virgule, et un groupe de cinq mots se
 * coupe en trois et deux plutôt qu'en quatre et un — « C'est savoir ouvrir la /
 * vanne » laissait l'article d'un côté et le mot qui compte seul de l'autre.
 */
export function enBlocs(mots: MotAffiche[], motsParBloc = 4): SousTitre[] {
    const blocs: SousTitre[] = [];
    let courant: MotAffiche[] = [];
    const fermer = () => {
        if (courant.length === 0) return;
        blocs.push({ texte: courant.map(m => m.texte).join(' '), debut: courant[0].debut, fin: courant[courant.length - 1].fin, mots: courant });
        courant = [];
    };
    const finDePhrase = (m: MotAffiche | undefined) => !!m && (m.coupure === 'phrase' || /[.?!…]$/.test(m.texte));
    // Un mot suivi d'un début de phrase du script en ferme une, ponctué ou non (v2.29).
    const pause = (k: number) => !!mots[k] && (finDePhrase(mots[k]) || mots[k].coupure === 'virgule' || !!mots[k + 1]?.ouvre);
    mots.forEach((m, i) => {
        const precedent = mots[i - 1];
        if (precedent && m.debut - precedent.fin > 0.6) fermer();
        /*
         * Une phrase du script s'ouvre : le bloc en cours ne l'enjambe pas (v2.29).
         * Sauf un mot seul, dit d'un souffle avec elle, qui l'amorce : « et | Ce
         * n'est plus vous » se lit d'un bloc, pas « et » seul à l'écran.
         */
        if (m.ouvre && precedent && courant.length > 0 && (courant.length >= 2 || m.debut - precedent.fin >= 0.2)) fermer();
        courant.push(m);
        const orphelin = courant.length === motsParBloc - 1 && !pause(i + 1) && pause(i + 2);
        if (courant.length >= motsParBloc || finDePhrase(m) || (m.coupure === 'virgule' && courant.length >= 2) || orphelin) fermer();
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
    /**
     * Le cadre de la prise, plan large ou serré, à partir de `a` (secondes de la
     * vidéo). Il change à chaque raccord : deux morceaux de la même prise mis
     * bout à bout, au même cadre, font sauter le visage ; à deux cadres, c'est
     * un changement de plan (§12.5.2).
     */
    cadrages: Array<{ a: number; serre: boolean }>;
}

/** Le silence qu'on garde avant le premier mot et après le dernier : assez pour respirer, pas pour attendre. */
const AIR_AVANT = 0.3;
const AIR_APRES = 0.6;

/** Un sous-titre plus court ne se lit pas : c'est le reste d'un bloc dont la coupe a emporté les mots. */
const SOUS_TITRE_MIN = 0.1;
/**
 * Le sous-titre arrive un dixième de seconde avant la voix : l'œil lit plus
 * lentement que l'oreille n'entend, et un texte pile sur le son paraît en retard
 * (§12.5.4).
 */
export const AVANCE_SOUS_TITRE = 0.1;
/** Un morceau plus court, entre deux coupes, sans un mot du script, est un reste : il saute à l'image et ne dit rien. */
const ECLAT_GARDE = 0.4;

/** Un repère corrigé à la main, en secondes dans la prise principale, par `séquence:élément`. */
export type ReperesCorriges = Record<string, number>;

/**
 * Les sous-titres d'un intervalle de la prise, rognés aux passages face caméra.
 * Rognés en MOTS aussi (v2.29) : un bloc à cheval sur l'arrivée d'une scène
 * écrivait déjà ses premiers mots — « et donc Au lieu » sur le visage, avant
 * que la scène ne les montre.
 */
function sousTitresCamera(blocs: SousTitre[], minutage: MinutageReel, data: ReelExplique): SousTitre[] {
    const cameras = minutage.sequences.filter((_, i) => data.sequences[i]?.plan === 'camera');
    return blocs.flatMap(b => {
        const milieu = (b.debut + b.fin) / 2;
        const plan = cameras.find(c => milieu >= c.debut && milieu < c.fin);
        if (!plan) return [];
        // Un mot appartient au passage où il commence d'être dit — son début, avancé pour l'œil, rendu à la voix.
        const mots = b.mots.filter(m => {
            const dit = m.debut + AVANCE_SOUS_TITRE;
            return dit >= plan.debut - 0.02 && dit < plan.fin;
        });
        if (mots.length === 0) return [];
        const texte = mots.length === b.mots.length ? b.texte : mots.map(m => m.texte).join(' ');
        return [{ ...b, texte, mots, debut: Math.max(b.debut, plan.debut), fin: Math.min(b.fin, plan.fin) }];
    });
}

/** Ce qu'on garde d'un passage de la prise, une fois les coupes ôtées. `coupes` triées et fusionnées. */
function garder(depuis: number, jusqua: number, coupes: Intervalle[]): Intervalle[] {
    const gardes: Intervalle[] = [];
    let curseur = depuis;
    for (const c of coupes) {
        if (c.fin <= curseur || c.debut >= jusqua) continue;
        if (c.debut > curseur) gardes.push({ debut: curseur, fin: c.debut });
        curseur = Math.max(curseur, c.fin);
    }
    if (curseur < jusqua) gardes.push({ debut: curseur, fin: jusqua });
    return gardes;
}

const longueurDe = (gardes: Intervalle[]) => gardes.reduce((s, g) => s + g.fin - g.debut, 0);

/**
 * Ce qui se monte d'une prise : chaque zone pour elle-même — le script, de sa
 * tête à sa queue, un passage rétabli, la fin improvisée —, débarrassée de ses
 * coupes, à partir de `depuis`. Jamais l'enveloppe des zones (v2.29) : rétablir
 * une phrase dite deux minutes après la fin du script ramenait tout ce qui les
 * séparait, et ce n'est que pour une phrase collée à la fin que l'essai du
 * 27/10 l'avait vérifié.
 */
function monter(zones: Intervalle[], coupes: Intervalle[], depuis: number, duree: number): Intervalle[] {
    const bornees = zones
        .map(z => ({ debut: Math.max(0, depuis, z.debut), fin: Math.min(duree, z.fin) }))
        .filter(z => z.fin > z.debut);
    return fusionnerIntervalles(bornees).flatMap(z => garder(z.debut, z.fin, coupes));
}

/**
 * Le temps de la prise → le temps de la vidéo, pour des morceaux posés bout à
 * bout à partir de `a`. Un instant coupé tombe au raccord : un repère pris dans
 * une coupe apparaît quand la voix reprend.
 */
function versLaVideo(gardes: Intervalle[], a: number): (t: number) => number {
    const departs: number[] = [];
    let x = a;
    for (const g of gardes) { departs.push(x); x += g.fin - g.debut; }
    return t => {
        for (let i = 0; i < gardes.length; i++) {
            if (t < gardes[i].debut) return departs[i];
            if (t <= gardes[i].fin) return departs[i] + t - gardes[i].debut;
        }
        return x;
    };
}

/**
 * Les mots que la vidéo montre, en blocs, reportés dans son temps. Un mot se
 * garde s'il tombe dans un morceau monté — pas seulement hors des coupes
 * (v2.29) : ce qui précède la tête ou suit la queue n'est dans aucune coupe, et
 * tombait au raccord. Le 30/10/2026, « revenir merci » et « travaillant au
 * cabinet. », dits deux minutes après la fin de la vidéo, s'affichaient sur ses
 * trois dernières images.
 */
function sousTitresDe(mots: MotAffiche[], gardes: Intervalle[], vers: (t: number) => number): SousTitre[] {
    const restants = mots.filter(m => {
        const milieu = (m.debut + m.fin) / 2;
        return gardes.some(g => milieu > g.debut && milieu < g.fin);
    });
    const blocs = enBlocs(restants).map(b => ({
        ...b,
        debut: Math.max(0, vers(b.debut) - AVANCE_SOUS_TITRE),
        fin: vers(b.fin),
        mots: b.mots.map(m => ({ ...m, debut: vers(m.debut) - AVANCE_SOUS_TITRE, fin: vers(m.fin) })),
    }));
    // Avancé, un bloc ne doit pas recouvrir la fin du précédent : deux sous-titres à la fois se superposent.
    blocs.forEach((b, i) => { const suivant = blocs[i + 1]; if (suivant && b.fin > suivant.debut) b.fin = suivant.debut; });
    return blocs.filter(b => b.fin - b.debut >= SOUS_TITRE_MIN);
}

/** Les morceaux gardés, sans les restes : ce qui est court et ne porte aucun mot du script part avec les coupes voisines. */
function sansEclats(gardes: Intervalle[], calage: Calage): Intervalle[] {
    const dits = calage.prononces ?? [];
    if (gardes.length < 2 || dits.length === 0) return gardes;
    return gardes.filter(g =>
        // De l'air seul, laissé entre une coupe et le bord d'une zone, ne montre rien, quelle que soit sa longueur (v2.29).
        dits.some(p => p.fin > g.debut && p.debut < g.fin)
        && (g.fin - g.debut >= ECLAT_GARDE || dits.some(p =>
            p.rang !== null && (p.debut + p.fin) / 2 > g.debut && (p.debut + p.fin) / 2 < g.fin)));
}

/** Où une seconde de la prise tombe dans la vidéo — au raccord si elle a été coupée, `null` si la vidéo ne la montre pas. */
export function instantDansLaVideo(plan: PlanDeMontage, source: SegmentVideo['source'], t: number): number | null {
    const morceaux = plan.segments.filter(s => s.source === source);
    for (const s of morceaux) {
        if (t < s.depuis) return s === morceaux[0] ? null : s.a;
        if (t <= s.jusqua) return s.a + t - s.depuis;
    }
    return null;
}

/**
 * Ce que la vidéo finale montre, et quand. Organique : la prise principale,
 * débarrassée de ses silences de tête et de queue et de ce que le dérushage a
 * coupé (§12.5.2). Publicité : la seconde accroche, puis la prise principale
 * reprise au premier mot de la séquence 2.
 */
export function planDeMontage(
    data: ReelExplique,
    principale: PriseCalee,
    options: {
        accroche?: PriseCalee | null;
        reperes?: ReperesCorriges;
        /** Ce que le dérushage retire de chaque prise, en secondes de cette prise (`coupesAppliquees`). */
        coupes?: Intervalle[];
        coupesAccroche?: Intervalle[];
        /**
         * Les passages rétablis à la main (`passagesManuels`, `coupe: false`),
         * en secondes de chaque prise. Hors du script, avant la première phrase
         * ou après la dernière, ils étendent ce qui est monté : sans eux, ce que
         * Florent a improvisé en fin de prise ne pouvait jamais revenir.
         */
        retablis?: Intervalle[];
        retablisAccroche?: Intervalle[];
    } = {},
): PlanDeMontage {
    const brut = minuterReel(data, principale.calage.horloge);
    // Un repère corrigé à la main l'emporte sur le calage : c'est Florent qui a vu la vidéo.
    brut.sequences.forEach((s, i) => {
        s.apparitions = s.apparitions.map((a, j) => {
            const corrige = options.reperes?.[`${i}:${j}`];
            return corrige === undefined ? a : corrige - s.debut;
        });
    });

    // L'air autour de la voix, sans mordre sur un mot dit juste avant ou juste
    // après qui n'est pas du script : « …vous plaît | apprenez-moi » s'enchaînent
    // sans pause, et 0,3 s d'air faisait entendre la fin de « plaît ».
    const dits = principale.calage.prononces ?? [];
    // Une reformulation retenue en ouverture commence avec sa phrase : son amorce est montée (v2.29).
    const premierRetenu = dits.findIndex(m => m.rang !== null);
    let ouverture = premierRetenu;
    while (ouverture > 0 && dits[ouverture - 1].amorce) ouverture--;
    const premierMot = Math.min(brut.sequences[0]?.debut ?? 0, ouverture >= 0 && ouverture < premierRetenu ? dits[ouverture].debut : Infinity);
    const avant = [...dits].reverse().find(m => m.fin <= premierMot + 1e-6);
    const tete = Math.max(0, premierMot - AIR_AVANT, avant ? Math.min(premierMot, avant.fin + 0.02) : 0);
    const apres = dits.find(m => m.debut >= principale.calage.fin - 1e-6);
    const queue = Math.min(principale.duree, principale.calage.fin + AIR_APRES,
        apres ? Math.max(principale.calage.fin, apres.debut - 0.02) : Infinity);
    // La fin improvisée, avec son air, sans mordre sur un mot voisin (v2.29).
    const improvisee = principale.calage.finImprovisee;
    const finImprovisee: Intervalle[] = improvisee ? [{
        debut: Math.max(improvisee.debut - AIR_AVANT, Math.min(improvisee.debut, (dits[improvisee.premier - 1]?.fin ?? 0) + 0.02)),
        fin: Math.min(improvisee.fin + AIR_APRES, Math.max(improvisee.fin, (dits[improvisee.dernier + 1]?.debut ?? Infinity) - 0.02)),
    }] : [];
    const coupes = options.coupes ?? [];
    const accroche = options.accroche && brut.sequences.length >= 2 ? options.accroche : null;

    const segments: SegmentVideo[] = [];
    const poser = (source: SegmentVideo['source'], gardes: Intervalle[], a: number) => {
        let x = a;
        for (const g of gardes) {
            segments.push({ source, depuis: g.debut, jusqua: g.fin, a: x });
            x += g.fin - g.debut;
        }
    };

    // La seconde accroche, calée sur son propre texte, dans son propre fichier.
    let longueur = 0;
    let depart = 0;
    const sousTitres: SousTitre[] = [];
    if (accroche) {
        const coupesAccroche = options.coupesAccroche ?? [];
        const gardes = monter([
            { debut: accroche.calage.horloge(0) - AIR_AVANT, fin: accroche.calage.fin + AIR_APRES / 2 },
            ...(options.retablisAccroche ?? []),
        ], coupesAccroche, 0, accroche.duree);
        poser('accroche', gardes, 0);
        longueur = longueurDe(gardes);
        sousTitres.push(...sousTitresDe(accroche.calage.motsAffiches, gardes, versLaVideo(gardes, 0))
            .map(b => ({ ...b, fin: Math.min(longueur, b.fin) })));
        // On reprend la prise principale juste avant le premier mot de la séquence 2.
        depart = Math.max(0, brut.sequences[1].debut - 0.12);
    }

    // Rétablir l'emporte sur les bornes du script : la main a le dernier mot (§12.5.5).
    const gardes = sansEclats(monter([{ debut: tete, fin: queue }, ...(options.retablis ?? []), ...finImprovisee], coupes, depart, principale.duree), principale.calage);
    poser('principale', gardes, longueur);
    const vers = versLaVideo(gardes, longueur);
    const duree = longueur + longueurDe(gardes);

    // Chaque séquence et chaque apparition, reportées dans le temps de la vidéo.
    // Une apparition se compte depuis le début de SA séquence : on passe par
    // l'instant absolu, puis on retranche le début retenu.
    const derniere = brut.sequences.length - 1;
    const sequences = brut.sequences.map((s, i) => {
        const absolues = s.apparitions.map(a => a === null ? null : vers(s.debut + a));
        let debut = i === 0 ? vers(Math.min(s.debut, premierMot)) : vers(s.debut);
        const fin = i === derniere ? duree : vers(s.fin);
        if (accroche && i === 1) debut = longueur;
        // Un coup de poing dont une coupe a mangé la fin se lit quand même.
        const coup = s.coup ? (() => {
            const frappe = vers(s.debut + s.coup.debut);
            return { debut: frappe - debut, fin: Math.min(fin, Math.max(vers(s.debut + s.coup.fin), frappe + COUP_MIN)) - debut };
        })() : null;
        return { debut, fin, apparitions: absolues.map(a => a === null ? null : a - debut), coup };
    });
    if (accroche) sequences[0] = { debut: 0, fin: longueur, apparitions: [], coup: null };
    const minutage: MinutageReel = { duree, sequences };

    sousTitres.push(...sousTitresCamera(sousTitresDe(principale.calage.motsAffiches, gardes, vers), minutage, data)
        .filter(b => b.debut >= longueur));

    // Le cadre alterne à chaque raccord, et aux phrases d'un long passage face caméra.
    const phrases = debutsDePhrases(voixEntiere(data))
        .map(rang => vers(principale.calage.horloge(rang)))
        .filter(a => a > longueur);
    // La fin improvisée n'a pas de phrase dans le script : on prend celles que la
    // transcription ponctue, et les respirations (v2.29) — sans quoi le visage
    // resterait fixe toute la tirade. `cadrer` n'en retient qu'une par plan.
    if (improvisee) {
        let ecritAvant = '';
        for (let k = improvisee.premier; k <= improvisee.dernier; k++) {
            if (!dits[k].ecrit) continue;
            if (k > improvisee.premier && (/[.?!…,;:]$/.test(ecritAvant) || dits[k].debut - dits[k - 1].fin >= RESPIRATION)) phrases.push(vers(dits[k].debut));
            ecritAvant = dits[k].ecrit;
        }
    }
    const cadrages = cadrer(data, minutage, phrases, segments.slice(1).map(s => s.a));

    return { duree, segments, minutage, sousTitres, cadrages };
}

// ── La signature (v2.27) ─────────────────────────────────────────────

/**
 * Le carton final, ajouté après le dernier mot : le nom, le titre, l'adresse.
 * Décision de Florent, le 28/10/2026 : la vidéo finissait sur « je travaille au
 * cabinet », sans dire où — luminose.fr n'avait pas été dit, et rien ne le
 * rattrapait. Comme la slide de signature d'un carrousel, c'est le code qui la
 * pose, jamais le modèle : rien ne peut y dériver.
 */
export const CARTON_FINAL = 2.2;

/**
 * Le bandeau qui nomme Florent sur l'accroche : il entre un peu après le premier
 * mot et s'en va avant la première scène, trois secondes au plus. Sur une
 * accroche trop courte pour qu'on le lise, il ne vient pas.
 */
export function bandeauDeSignature(minutage: MinutageReel): { debut: number; fin: number } | null {
    const premiere = minutage.sequences[0];
    if (!premiere) return null;
    const debut = premiere.debut + 0.3;
    const fin = Math.min(debut + 3, premiere.fin - 0.15);
    return fin - debut >= 1.2 ? { debut, fin } : null;
}

// ── Le rythme (V7) ───────────────────────────────────────────────────

/**
 * Le rang de chaque mot qui ouvre une phrase, la première exceptée : c'est là
 * qu'un recadrage tombe naturellement, sur une respiration de la voix.
 */
export function debutsDePhrases(texte: string): number[] {
    const mots = motsSitues(texte);
    return mots.flatMap((m, i) => {
        const entre = i > 0 ? texte.slice(mots[i - 1].fin, m.debut) : '';
        // Une ponctuation suivie d'un blanc : le point de « luminose.fr » ne ferme rien.
        return /[.?!…]/.test(entre) && /\s/.test(entre) ? [i] : [];
    });
}

/** Un plan plus court se remarque comme un tic : on ne recadre pas deux phrases brèves d'affilée. */
export const PLAN_MIN = 2.5;
/** Un recadrage juste avant un raccord ferait deux changements de plan coup sur coup. */
const AVANT_RACCORD = 1;

const dansUnPassageCamera = (data: ReelExplique, minutage: MinutageReel, a: number) =>
    minutage.sequences.some((m, i) => data.sequences[i]?.plan === 'camera' && a > m.debut && a < m.fin);

/**
 * Où le cadre de la prise change, et pour quoi (SPEC §12.5.3). À chaque
 * raccord, toujours : c'est ce qui fait d'une coupe un changement de plan. Et
 * au début d'une phrase dite face caméra, quand le plan en cours a duré assez
 * et qu'aucun raccord n'arrive : un visage immobile pendant toute une tirade
 * est le moment où le pouce reprend le défilement.
 */
export function cadrer(
    data: ReelExplique,
    minutage: MinutageReel,
    phrases: number[],
    raccords: number[],
): Array<{ a: number; serre: boolean }> {
    const obligatoires = new Set(raccords);
    const candidats = [
        ...raccords,
        ...phrases.filter(a => dansUnPassageCamera(data, minutage, a)),
    ].sort((x, y) => x - y);
    const points: number[] = [0];
    for (const a of candidats) {
        const dernier = points[points.length - 1];
        if (obligatoires.has(a)) {
            if (a > dernier) points.push(a);
            continue;
        }
        const prochainRaccord = raccords.find(r => r > a) ?? Infinity;
        if (a - dernier >= PLAN_MIN && prochainRaccord - a >= AVANT_RACCORD) points.push(a);
    }
    return points.map((a, i) => ({ a, serre: i % 2 === 1 }));
}

/** Au-delà, l'image est figée : en vidéo courte, cinq secondes sans que rien ne bouge, c'est long. */
export const FIGE_MAX = 5;

export interface MomentFige {
    debut: number;
    fin: number;
    /** La séquence où il commence, à partir de 0. */
    sequence: number;
}

/**
 * Les moments où rien ne change à l'écran plus de `seuil` secondes. Compte
 * comme un changement : le début d'une séquence, l'apparition d'un élément, un
 * coup de poing qui frappe ou s'en va, un recadrage — s'il tombe face caméra :
 * sous une scène, il ne se voit pas. Les sous-titres ne comptent pas : ils
 * changent sans cesse, et c'est l'image qu'on regarde.
 */
export function momentsFiges(
    data: ReelExplique,
    minutage: MinutageReel,
    cadrages: Array<{ a: number }> = [],
    seuil = FIGE_MAX,
): MomentFige[] {
    const instants = [0, minutage.duree];
    minutage.sequences.forEach((m, i) => {
        instants.push(m.debut);
        m.apparitions.forEach(a => { if (a !== null) instants.push(m.debut + a); });
        if (m.coup) instants.push(m.debut + m.coup.debut, m.debut + m.coup.fin);
        // Les lignes d'une liste arrivent une à une : chacune change l'écran (v2.26).
        const elements = data.sequences[i]?.elements ?? [];
        const debuts = debutsDesEcrans(m.apparitions, m.fin - m.debut);
        elements.forEach((e, j) => {
            const schema = schemaDe(e.visuel);
            if (schema?.schema !== 'liste') return;
            const fin = (debuts[j + 1] ?? m.fin - m.debut) - debuts[j];
            arriveesDeLaListe(schema.items?.length ?? 0, fin).forEach(a => instants.push(m.debut + debuts[j] + a));
        });
    });
    cadrages.forEach(c => { if (dansUnPassageCamera(data, minutage, c.a)) instants.push(c.a); });
    const tries = [...new Set(instants)].sort((x, y) => x - y);
    const figes: MomentFige[] = [];
    for (let i = 0; i + 1 < tries.length; i++) {
        if (tries[i + 1] - tries[i] <= seuil) continue;
        const sequence = Math.max(0, minutage.sequences.findIndex(m => tries[i] >= m.debut && tries[i] < m.fin));
        figes.push({ debut: tries[i], fin: tries[i + 1], sequence });
    }
    return figes;
}

// ── Le texte, séquence par séquence ──────────────────────────────────

/** Au-delà, deux bouts hors script ne se tiennent plus : ce sont deux tentatives. */
const PAUSE_ENTRE_TENTATIVES = 1.2;

/**
 * La séquence du script à laquelle appartient chaque mot dit, jeton par jeton
 * (SPEC §12.5.5, v2.21) : le montage par le texte se lit séquence par séquence,
 * comme le script, et non comme une prise au kilomètre.
 *
 * Un mot qui répond au script va à la séquence de son rang. Une version écartée
 * d'une phrase va à la séquence de cette phrase : une reprise se lit à côté de
 * celle qu'on a gardée. Le reste — hésitations, improvisations — va, par bouts
 * d'un seul tenant, au mot du script dont il est le plus près dans le temps : une
 * hésitation colle à la phrase qu'elle précède, une improvisation à celle
 * qu'elle prolonge. Avant la première phrase, il va à la première séquence ;
 * après la dernière, à la dernière.
 */
export function sequenceDeChaqueJeton(calage: Calage, motsParSequence: number[]): number[] {
    const fins: number[] = [];
    motsParSequence.reduce((n, m) => { fins.push(n + m); return n + m; }, 0);
    const derniere = Math.max(0, motsParSequence.length - 1);
    const sequenceDuRang = (rang: number) => {
        const k = fins.findIndex(f => rang < f);
        return k < 0 ? derniere : k;
    };

    const jetons = calage.prononces ?? [];
    const sequences: Array<number | null> = jetons.map(p => (p.rang !== null && !p.autrePrise ? sequenceDuRang(p.rang) : null));
    for (const choisie of calage.phrases ?? []) {
        const k = sequenceDuRang(choisie.phrase.debut);
        choisie.versions.forEach((v, i) => {
            if (i === choisie.retenue) return;
            for (let j = v.debut; j <= v.fin && j < jetons.length; j++) sequences[j] ??= k;
        });
    }

    // De gauche à droite : le mot qui précède un passage hors script est déjà rangé.
    for (let j = 0; j < jetons.length; j++) {
        if (sequences[j] !== null) continue;
        let fin = j;
        while (fin + 1 < jetons.length && sequences[fin + 1] === null
            && jetons[fin + 1].debut - jetons[fin].fin <= PAUSE_ENTRE_TENTATIVES) fin++;
        let suivant = fin + 1;
        while (suivant < jetons.length && sequences[suivant] === null) suivant++;
        const avant = j > 0 ? sequences[j - 1] : null;
        const apres = suivant < jetons.length ? sequences[suivant] : null;
        const k = avant === null ? apres ?? 0
            : apres === null ? avant
                : jetons[j].debut - jetons[j - 1].fin < jetons[suivant].debut - jetons[fin].fin ? avant : apres;
        for (let x = j; x <= fin; x++) sequences[x] = k;
        j = fin;
    }
    return sequences as number[];
}
