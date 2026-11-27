/**
 * Frontière base des clients ↔ application (SPEC §14.4).
 *
 * `snake_case` en base, `camelCase` en TypeScript, et **un point d'entrée par
 * base** : `src/db.ts` pour l'éditorial, ce fichier-ci pour les clients.
 * `src/db.ts` ne connaît pas cette base (règle 1), et celui-ci ne connaît pas
 * l'éditoriale.
 *
 * La conversion est mécanique — elle ne dépend d'aucun nom de table —, ce qui
 * la garde loin des tables sensibles : seul `sensible.ts` les nomme (règle 3).
 * Les colonnes JSON (`identite_recue`, `provenance`, `questions`) restent des
 * chaînes : leur schéma appartient au contrat, et il bouge avec lui.
 */

/** `occupe_jusqua` → `occupeJusqua`. */
export const enCamel = (nom: string): string => nom.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** `occupeJusqua` → `occupe_jusqua`. */
export const enSnake = (nom: string): string => nom.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Une ligne de la base, ses colonnes en camelCase. */
export const depuisLigne = <T>(ligne: Record<string, unknown>): T =>
  Object.fromEntries(Object.entries(ligne).map(([cle, valeur]) => [enCamel(cle), valeur])) as T;

/** Un objet de l'application, ses champs en snake_case pour la base. */
export const versLigne = (objet: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(objet).map(([cle, valeur]) => [enSnake(cle), valeur]));

/** Une séance, telle que la base la porte (Annexe C). */
export type Seance = {
  id: string;
  clientId: string | null;
  typeSeanceId: string | null;
  identiteRecue: string | null;
  debut: number;
  dureeMin: number;
  occupeJusqua: number;
  revision: number;
  statut: 'prevue' | 'realisee' | 'annulee' | 'absent';
  etatPaiement: 'a_payer' | 'attente_especes' | 'payee' | 'offerte' | 'annulee';
  montantCentimes: number;
  mode: 'sur_place' | 'visio' | 'appel' | null;
  agendaEtat: 'a_ecrire' | 'ecrit' | 'echec';
  liensVersion: number;
  origine: 'site' | 'console' | 'import';
  createdAt: number;
  updatedAt: number;
};

/** Une inscription à un évènement, telle que la base la porte (Annexe C). */
export type Inscription = {
  id: string;
  evenementId: string;
  clientId: string | null;
  statut: 'retenue' | 'payee' | 'confirmee' | 'expiree' | 'annulee' | 'deconseillee';
  retenueJusqua: number | null;
  modePaiement: 'carte' | 'virement' | null;
  montantCentimes: number | null;
  reference: string;
  liensVersion: number;
  origine: 'site' | 'console' | 'import';
  createdAt: number;
  updatedAt: number;
};

/** Ce que la console montre de la base : trois effectifs. */
export type EtatBaseClients = { fiches: number; seances: number; evenements: number };
