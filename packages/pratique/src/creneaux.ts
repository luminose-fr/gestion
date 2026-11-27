/**
 * Les créneaux libres (SPEC §14.7, §14.7.1).
 *
 * Horaires du jour − occupations, dans la fenêtre du type, par pas du type.
 * **La même génération sert à afficher et à réserver** : `creneauxLibres` et
 * `verifierCreneau` passent par `grilleDuJour` et par les deux mêmes tests,
 * pour qu'un créneau affiché ne puisse pas être refusé par une autre règle que
 * celle qui l'a montré — seule la tolérance du bas de la fenêtre les distingue.
 */
import { instantDeParis, jourDeLaSemaine, jourDeParis, jourSuivant } from './temps.ts';

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;

export type TypeDeSeance = {
    dureeMin: number;
    margeApresMin: number;
    pasMin: number;
    fenetreDebutH: number;
    fenetreFinH: number;
};

/** `'HH:MM'`, heure de Paris. */
export type Plage = { debut: string; fin: string };

export type Horaires = {
    /** 1 = lundi … 7 = dimanche. */
    semaine: Record<number, Plage[]>;
    /** `'AAAA-MM-JJ'` → les plages de ce jour, à la place de la semaine type ; `[]` ferme la journée. */
    dates: Record<string, Plage[]>;
};

/** Des instants ; l'intervalle `[debut, fin[`. */
export type Occupation = { debut: number; fin: number };

export type DemandeDeCreneaux = {
    type: TypeDeSeance;
    horaires: Horaires;
    /** Les séances prévues (de `debut` à `occupe_jusqua`) et les plages occupées de l'agenda, mêlées. */
    occupations: Occupation[];
    maintenant: number;
    /** Du jour `du` au jour `au` compris, `'AAAA-MM-JJ'`. */
    du: string;
    au: string;
    /** 0 pour afficher, 15 pour réserver (§14.7). Ne joue qu'en bas de la fenêtre. */
    toleranceMin?: number;
};

export type VerdictDeCreneau = 'libre' | 'hors_fenetre' | 'creneau_pris';

/** Règle 1 : une date présente remplace la semaine type, même vide. */
const plagesDuJour = (horaires: Horaires, jour: string): Plage[] =>
    Object.prototype.hasOwnProperty.call(horaires.dates, jour)
        ? horaires.dates[jour]
        : horaires.semaine[jourDeLaSemaine(jour)] ?? [];

const etendue = (type: TypeDeSeance): number => (type.dureeMin + type.margeApresMin) * MINUTE;

/**
 * Règles 2 et 5 : les débuts possibles d'un jour, sans fenêtre ni occupation.
 * Le pas se compte en durée écoulée depuis le début de la plage : une nuit de
 * changement d'heure, les créneaux suivent la montre réelle, pas le cadran.
 */
const grilleDuJour = (type: TypeDeSeance, horaires: Horaires, jour: string): number[] => {
    const debuts: number[] = [];
    const pas = type.pasMin * MINUTE;
    // Un pas nul ne finirait jamais ; il n'a pas de sens, il ne donne rien.
    if (!(pas > 0)) return debuts;
    for (const plage of plagesDuJour(horaires, jour)) {
        const debut = instantDeParis(jour, plage.debut);
        const fin = instantDeParis(jour, plage.fin);
        // Une plage inversée (02:30–03:00 la nuit du passage à l'heure d'été) ne
        // remplit pas cette condition dès le premier tour : aucun créneau, rien ne lève.
        for (let t = debut; t + etendue(type) <= fin; t += pas) debuts.push(t);
    }
    return debuts;
};

/** Règle 4 : les deux bornes comprises ; la tolérance n'abaisse que celle du bas. */
const dansLaFenetre = (debut: number, d: DemandeDeCreneaux): boolean =>
    d.maintenant + d.type.fenetreDebutH * HEURE - (d.toleranceMin ?? 0) * MINUTE <= debut
    && debut <= d.maintenant + d.type.fenetreFinH * HEURE;

/** Règle 3 : `[debut, debut + durée + marge[` contre chaque `[debut, fin[` ; se toucher n'est pas chevaucher. */
const estPris = (debut: number, d: DemandeDeCreneaux): boolean => {
    const fin = debut + etendue(d.type);
    return d.occupations.some((o) => o.debut < fin && debut < o.fin);
};

/**
 * Les débuts libres, triés, du jour `du` au jour `au` compris (règle 6 : la
 * période n'est pas bornée ici ; `du` après `au` ne rend rien).
 */
export const creneauxLibres = (d: DemandeDeCreneaux): number[] => {
    const libres: number[] = [];
    for (let jour = d.du; jour <= d.au; jour = jourSuivant(jour)) {
        for (const debut of grilleDuJour(d.type, d.horaires, jour)) {
            if (dansLaFenetre(debut, d) && !estPris(debut, d)) libres.push(debut);
        }
    }
    // Les plages d'un jour peuvent arriver dans le désordre ; la liste rendue, non.
    return libres.sort((a, b) => a - b);
};

/**
 * Le verdict sur un début demandé. Hors de la grille de son jour ou hors de la
 * fenêtre : `hors_fenetre` ; dans les deux, mais chevauchant une occupation :
 * `creneau_pris` ; sinon `libre`. `du` et `au` ne servent pas : le jour est
 * celui du début demandé.
 */
export const verifierCreneau = (
    d: Omit<DemandeDeCreneaux, 'du' | 'au'> & Partial<Pick<DemandeDeCreneaux, 'du' | 'au'>> & { debut: number },
): VerdictDeCreneau => {
    const demande: DemandeDeCreneaux = { ...d, du: jourDeParis(d.debut), au: jourDeParis(d.debut) };
    if (!grilleDuJour(d.type, d.horaires, demande.du).includes(d.debut)) return 'hors_fenetre';
    if (!dansLaFenetre(d.debut, demande)) return 'hors_fenetre';
    return estPris(d.debut, demande) ? 'creneau_pris' : 'libre';
};
