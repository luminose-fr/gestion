/**
 * Le temps de Paris (SPEC §14.7, §14.7.1).
 *
 * Un horaire est une heure de Paris ; un instant, des millisecondes UTC. Ce
 * module est le seul passage de l'un à l'autre, et il ne lit jamais l'horloge :
 * l'instant présent est toujours un paramètre de qui l'appelle.
 *
 * `Intl` suffit, sans bibliothèque de dates : il porte la base des fuseaux du
 * moteur, la même dans le Worker, sur la VM et dans le navigateur.
 */

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

/** `hourCycle: 'h23'` : sans lui, certains moteurs écrivent minuit « 24 ». */
const PARIS = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
});

type Champs = { annee: number; mois: number; jour: number; heure: number; minute: number; seconde: number };

const champsDeParis = (instant: number): Champs => {
    const p: Record<string, number> = {};
    for (const { type, value } of PARIS.formatToParts(instant)) {
        if (type !== 'literal') p[type] = Number(value);
    }
    return { annee: p.year, mois: p.month, jour: p.day, heure: p.hour, minute: p.minute, seconde: p.second };
};

/** Le décalage de Paris à cet instant, en millisecondes (+1 h l'hiver, +2 h l'été). */
const decalage = (instant: number): number => {
    const c = champsDeParis(instant);
    // Le décalage se mesure à la seconde : les millisecondes ne changent pas d'un fuseau à l'autre.
    const seconde = instant - (((instant % 1000) + 1000) % 1000);
    return Date.UTC(c.annee, c.mois - 1, c.jour, c.heure, c.minute, c.seconde) - seconde;
};

const deux = (n: number): string => String(n).padStart(2, '0');

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HORAIRE = /^(\d{2}):(\d{2})$/;

/** `'AAAA-MM-JJ'` → minuit UTC de ce jour du calendrier, ou `null` s'il n'existe pas. */
const minuitUtc = (date: string): number | null => {
    const m = DATE.exec(date);
    if (!m) return null;
    const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const t = Date.UTC(a, mo - 1, j);
    const d = new Date(t);
    return d.getUTCFullYear() === a && d.getUTCMonth() === mo - 1 && d.getUTCDate() === j ? t : null;
};

const dateInvalide = (date: string): never => {
    throw new RangeError(`Date invalide : ${JSON.stringify(date)} (attendu AAAA-MM-JJ)`);
};

/**
 * Une heure de Paris → l'instant qu'elle désigne.
 *
 * Deux nuits par an, la lecture n'est pas évidente, et elle est fixée ici :
 * - une heure **qui n'existe pas** (passage à l'heure d'été, 02:00 → 03:00) se lit
 *   avec le décalage d'avant le changement : `2027-03-28` `02:30` → `01:30Z` ;
 * - une heure **qui existe deux fois** (passage à l'heure d'hiver) désigne sa
 *   première occurrence : `2027-10-31` `02:30` → `00:30Z`.
 *
 * Une date ou une heure mal formée est une faute de l'appelant, pas une donnée :
 * elle lève. Les horaires arrivent de la base, déjà validés.
 */
export const instantDeParis = (date: string, heure: string): number => {
    const minuit = minuitUtc(date) ?? dateInvalide(date);
    const h = HORAIRE.exec(heure);
    if (!h || Number(h[1]) > 23 || Number(h[2]) > 59) {
        throw new RangeError(`Heure invalide : ${JSON.stringify(heure)} (attendu HH:MM)`);
    }
    // L'heure lue comme si Paris était à UTC : il ne reste qu'à retrancher le bon décalage.
    const murale = minuit + Number(h[1]) * HEURE + Number(h[2]) * MINUTE;
    // Les changements d'heure de Paris sont à des mois l'un de l'autre : douze heures
    // avant et après encadrent toujours au plus un changement.
    const avant = decalage(murale - 12 * HEURE);
    const apres = decalage(murale + 12 * HEURE);
    const possibles = [murale - avant, murale - apres].filter((t) => decalage(t) === murale - t);
    if (possibles.length === 0) return murale - avant;
    return Math.min(...possibles);
};

/** L'instant avec son décalage, tel que le contrat le veut : `2026-12-17T09:30:00+01:00`. */
export const isoDeParis = (instant: number): string => {
    const c = champsDeParis(instant);
    const d = decalage(instant) / MINUTE;
    const signe = d < 0 ? '-' : '+';
    const abs = Math.abs(d);
    return `${c.annee}-${deux(c.mois)}-${deux(c.jour)}T${deux(c.heure)}:${deux(c.minute)}:${deux(c.seconde)}`
        + `${signe}${deux(Math.floor(abs / 60))}:${deux(abs % 60)}`;
};

/** Le jour de Paris où tombe cet instant, `'AAAA-MM-JJ'`. */
export const jourDeParis = (instant: number): string => {
    const c = champsDeParis(instant);
    return `${c.annee}-${deux(c.mois)}-${deux(c.jour)}`;
};

/** 1 (lundi) … 7 (dimanche) : la convention de la table `horaires`. */
export const jourDeLaSemaine = (date: string): number => {
    const minuit = minuitUtc(date) ?? dateInvalide(date);
    return ((new Date(minuit).getUTCDay() + 6) % 7) + 1;
};

/** Le jour du calendrier qui suit, `'AAAA-MM-JJ'`. */
export const jourSuivant = (date: string): string => {
    const d = new Date((minuitUtc(date) ?? dateInvalide(date)) + JOUR);
    return `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}`;
};

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Un texte du contrat → un instant, ou `null`.
 *
 * Un texte **sans décalage** est refusé : `2026-12-17T09:30` ne dit pas de quel
 * fuseau il parle, et le deviner serait réserver à la mauvaise heure. Une date
 * qui n'existe pas (`2026-02-30`) l'est aussi : `Date.parse` la reporterait
 * parfois au mois suivant sans rien dire.
 */
export const instantDepuisIso = (texte: string): number | null => {
    const m = ISO.exec(texte);
    if (!m) return null;
    const minuit = minuitUtc(`${m[1]}-${m[2]}-${m[3]}`);
    const [h, mi, s] = [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
    if (minuit === null || h > 23 || mi > 59 || s > 59) return null;
    const ms = Number((m[7] ?? '').padEnd(3, '0'));
    let decal = 0;
    if (m[8] !== 'Z') {
        const [dh, dm] = [Number(m[8].slice(1, 3)), Number(m[8].slice(4, 6))];
        if (dh > 23 || dm > 59) return null;
        decal = (m[8][0] === '-' ? -1 : 1) * (dh * HEURE + dm * MINUTE);
    }
    return minuit + h * HEURE + mi * MINUTE + s * 1000 + ms - decal;
};
