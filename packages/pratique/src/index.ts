/**
 * @luminose/pratique — les règles de la pratique (SPEC §14.3).
 *
 * Des fonctions pures : ni base, ni réseau, ni API Workers, aucune dépendance.
 * Ce paquet est au domaine des clients ce que `editorial` est aux contenus.
 * Il porte la désignation d'un client (S1), le temps de Paris, le calcul des
 * créneaux et de la fenêtre de réservation, et la liste d'attente (K1) — et ces
 * règles ne vivent nulle part ailleurs.
 */
export { normaliserEmail, normaliserNom, nomRecherche, cleClient } from './client.ts';
export { instantDeParis, isoDeParis, jourDeParis, jourDeLaSemaine, jourSuivant, instantDepuisIso } from './temps.ts';
export { creneauxLibres, verifierCreneau } from './creneaux.ts';
export type { TypeDeSeance, Plage, Horaires, Occupation, DemandeDeCreneaux, VerdictDeCreneau } from './creneaux.ts';
export { quiPrevenir } from './attente.ts';
export type { CreneauLibere, SeanceEnAttente, ReglagesAttente } from './attente.ts';
