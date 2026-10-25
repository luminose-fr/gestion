/**
 * L'enveloppe sonore d'une prise — son volume, toutes les dix millisecondes —
 * et ce qu'elle corrige dans la transcription (SPEC §12.5.4).
 *
 * Constaté le 25/10/2026 sur une vraie prise de Florent : quand il reprend la
 * parole après une pause, Whisper fait commencer le premier mot dès la fin du
 * mot précédent. « en » durait 4,4 s, « et » 3,7 s : le silence était avalé par
 * le mot. Les silences n'existaient donc pas pour le dérushage, les coupes
 * tombaient à côté, et sous-titres et cartes arrivaient jusqu'à quatre secondes
 * trop tôt. Le son, lui, dit exactement où l'on parle.
 *
 * Whisper reste l'autorité sur CE QUI est dit ; le son, sur QUAND on parle.
 * Calcul pur : l'enveloppe est mesurée dans le navigateur à l'extraction du son,
 * rangée avec la transcription, et lue ici.
 */
import type { MotPrononce } from './calage';
import type { Intervalle } from './derushage';

/**
 * Un niveau par pas de temps, en décibels entiers de −90 à 0, chacun écrit en
 * un caractère (code 35 à 125) : vingt mille mesures pour trois minutes et
 * demie tiennent en vingt kilo-octets de texte, sans base64 ni dépendance.
 */
export interface Enveloppe {
    /** En secondes : 0,01. */
    pas: number;
    niveaux: string;
}

const PLANCHER = -90;
const ZERO = 35;

export const encoderNiveaux = (decibels: ArrayLike<number>): string => {
    let texte = '';
    for (let i = 0; i < decibels.length; i++) {
        const db = Number.isFinite(decibels[i]) ? Math.round(decibels[i]) : PLANCHER;
        texte += String.fromCharCode(ZERO + Math.min(0, Math.max(PLANCHER, db)) - PLANCHER);
    }
    return texte;
};

export const lireNiveaux = (enveloppe: Enveloppe): number[] =>
    Array.from(enveloppe.niveaux, c => c.charCodeAt(0) - ZERO + PLANCHER);

/**
 * Le seuil de la parole se déduit de la prise elle-même : à 35 % du chemin entre
 * le fond (le 10ᵉ centile, la pièce quand on se tait) et la voix (le 95ᵉ). Un
 * seuil fixe ne vaudrait que pour un micro et une pièce.
 */
const PART_DU_SEUIL = 0.35;
/** Une syllabe qui s'éteint ne fait pas un silence : on comble les trous plus courts. */
const TROU_MAX = 0.15;
/** Un claquement, un souffle : on ignore les éclats plus courts. */
const ECLAT_MIN = 0.08;

/** Les passages où l'on parle, en secondes, triés. */
export function regionsDeParole(enveloppe: Enveloppe): Intervalle[] {
    const db = lireNiveaux(enveloppe);
    if (db.length === 0) return [];
    const tries = [...db].sort((a, b) => a - b);
    const centile = (p: number) => tries[Math.min(tries.length - 1, Math.floor(p * tries.length))];
    const fond = centile(0.1);
    const voix = centile(0.95);
    if (voix - fond < 6) return [{ debut: 0, fin: db.length * enveloppe.pas }];
    const seuil = fond + PART_DU_SEUIL * (voix - fond);

    const brutes: Intervalle[] = [];
    let debut = -1;
    db.forEach((niveau, i) => {
        if (niveau > seuil && debut < 0) debut = i;
        if (niveau <= seuil && debut >= 0) { brutes.push({ debut: debut * enveloppe.pas, fin: i * enveloppe.pas }); debut = -1; }
    });
    if (debut >= 0) brutes.push({ debut: debut * enveloppe.pas, fin: db.length * enveloppe.pas });

    const comblees: Intervalle[] = [];
    for (const r of brutes) {
        const derniere = comblees[comblees.length - 1];
        if (derniere && r.debut - derniere.fin < TROU_MAX) derniere.fin = r.fin;
        else comblees.push({ ...r });
    }
    return comblees.filter(r => r.fin - r.debut >= ECLAT_MIN);
}

/** La région de parole qui contient `t`, ou `undefined` : on y est en silence. */
const regionDe = (regions: Intervalle[], t: number) => regions.find(r => t >= r.debut && t <= r.fin);

/** Un mot sans voix à moins de cette marge n'a pas été dit : c'est Whisper qui l'a imaginé. */
const MARGE_MUET = 0.15;
/** Ce qu'un mot garde au moins, une fois recalé. */
const MOT_MIN = 0.05;
/** Un silence plus long, À L'INTÉRIEUR d'un mot, n'en fait pas partie : on ne prononce pas un mot en deux fois. */
const SILENCE_INTERNE = 0.3;

/**
 * Les mots de Whisper, recalés sur la voix. Un mot qui COMMENCE dans un silence
 * commence en fait à la reprise de la voix ; un mot qui FINIT dans un silence
 * finit quand la voix s'arrête. Un mot qui CONTIENT un silence commence après
 * lui : Whisper fait démarrer le premier mot d'une reprise à la fin du mot
 * d'avant, parfois une fraction de seconde trop tôt pour tomber dans le silence
 * (« et », sur la prise du 25/10 : 0,03 s avant la fin de la phrase précédente,
 * puis 3,7 s de silence). Un mot posé en plein silence, loin de toute
 * voix, est retiré : en fin de prise surtout, Whisper invente — « Merci. » est
 * son hallucination la plus connue en français.
 *
 * On ne touche pas à un mot dont les deux bords tombent dans la voix : au milieu
 * d'une phrase, le son ne sait pas mieux que Whisper où passe la frontière.
 */
export function recalerSurLeSon(mots: MotPrononce[], regions: Intervalle[]): MotPrononce[] {
    if (regions.length === 0) return mots;
    const recales: MotPrononce[] = [];
    for (const m of mots) {
        const audible = regions.some(r => r.fin > m.debut - MARGE_MUET && r.debut < m.fin + MARGE_MUET);
        if (!audible) continue;
        let debut = m.debut;
        let fin = m.fin;
        // Le dernier silence assez long à l'intérieur du mot : le mot commence après.
        const dedans = regions.filter(r => r.fin > debut && r.debut < fin);
        for (let i = dedans.length - 1; i > 0; i--) {
            // La voix peut ne reprendre qu'au tout dernier centième du mot : c'est encore lui.
            if (dedans[i].debut - dedans[i - 1].fin >= SILENCE_INTERNE && dedans[i].debut < fin) {
                debut = dedans[i].debut;
                break;
            }
        }
        if (!regionDe(regions, debut)) {
            const reprise = regions.find(r => r.debut > debut && r.debut < fin);
            if (reprise) debut = reprise.debut;
        }
        if (!regionDe(regions, fin)) {
            const arret = [...regions].reverse().find(r => r.fin < fin && r.fin > debut + MOT_MIN);
            if (arret) fin = arret.fin;
        }
        // Les mots restent dans l'ordre : un recalage ne fait pas passer un mot avant le précédent.
        const precedent = recales[recales.length - 1];
        if (precedent && debut < precedent.fin) debut = Math.min(Math.max(debut, precedent.fin), fin - MOT_MIN);
        recales.push({ ...m, debut, fin: Math.max(fin, debut + MOT_MIN) });
    }
    return recales;
}

/**
 * Le point le plus silencieux près d'un instant, dans ±`portee` secondes : c'est
 * là qu'une coupe s'entend le moins. Sans enveloppe, l'instant lui-même.
 */
export function creuxLePlusProche(enveloppe: Enveloppe | undefined, t: number, portee = 0.12): number {
    if (!enveloppe) return t;
    const db = lireNiveaux(enveloppe);
    const centre = Math.round(t / enveloppe.pas);
    const rayon = Math.round(portee / enveloppe.pas);
    let meilleur = centre;
    for (let i = Math.max(0, centre - rayon); i <= Math.min(db.length - 1, centre + rayon); i++) {
        // À niveau égal, le plus proche de l'instant visé.
        if (db[i] < db[meilleur] || (db[i] === db[meilleur] && Math.abs(i - centre) < Math.abs(meilleur - centre))) meilleur = i;
    }
    return meilleur * enveloppe.pas;
}
