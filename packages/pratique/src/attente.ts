/**
 * La liste d'attente : qui prévenir d'un créneau libéré (SPEC §14.7.1 ;
 * modèle de données, §3.1 et §5 règle 3).
 *
 * Prévenir quelqu'un, c'est lui envoyer un e-mail et peut-être lui faire
 * déplacer sa séance : la règle se trompe dans le sens du silence. Le premier
 * qui prend le créneau l'obtient ; tout est revérifié à la prise.
 */

const HEURE = 3_600_000;

export type CreneauLibere = {
    debut: number;
    /** L'intervalle rendu, marge comprise. */
    dureeMin: number;
};

export type SeanceEnAttente = {
    id: string;
    /** La fiche ; `null` pour une séance « à rapprocher », qui compte pour elle-même. */
    personne: string | null;
    debut: number;
    /** Durée + marge de son type. */
    occupationMin: number;
    reserveeLe: number;
    listeAttente: boolean;
    statut: string;
};

export type ReglagesAttente = {
    /** Un créneau n'est proposé que s'il commence dans ce délai ou plus (48). */
    creneauMinH: number;
    /** Une séance n'est concernée que si elle commence dans ce délai ou plus (48). */
    seanceMinH: number;
    /** Le plafond, en personnes (8). */
    personnesMax: number;
};

/** L'ordre de la file : réservée depuis le plus longtemps, puis l'identifiant, pour un ordre stable. */
const plusAncienne = (a: SeanceEnAttente, b: SeanceEnAttente): number =>
    a.reserveeLe - b.reserveeLe || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Les identifiants des séances dont la personne est à prévenir, dans l'ordre. */
export const quiPrevenir = ({ creneau, seances, reglages, maintenant }: {
    creneau: CreneauLibere;
    seances: SeanceEnAttente[];
    reglages: ReglagesAttente;
    maintenant: number;
}): string[] => {
    // Les deux seuils sont compris : « dans 48 heures ou plus » (modèle, §3.1).
    if (creneau.debut < maintenant + reglages.creneauMinH * HEURE) return [];

    const eligibles = seances.filter((s) =>
        s.statut === 'prevue'
        && s.listeAttente
        && s.debut > creneau.debut
        && s.debut >= maintenant + reglages.seanceMinH * HEURE
        && s.occupationMin <= creneau.dureeMin,
    ).sort(plusAncienne);

    // Le plafond compte des personnes : d'une même fiche, seule la plus ancienne
    // réservation garde sa place. Le tri précède, donc la première vue est la bonne.
    const vues = new Set<string>();
    const retenues: string[] = [];
    for (const s of eligibles) {
        if (retenues.length >= reglages.personnesMax) break;
        if (s.personne !== null) {
            if (vues.has(s.personne)) continue;
            vues.add(s.personne);
        }
        retenues.push(s.id);
    }
    return retenues;
};
