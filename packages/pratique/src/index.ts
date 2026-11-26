/**
 * @luminose/pratique — les règles de la pratique (SPEC §14.3).
 *
 * Des fonctions pures : ni base, ni réseau, ni API Workers, aucune dépendance.
 * Ce paquet est au domaine des clients ce que `editorial` est aux contenus.
 * Dans la phase S1, il porte la désignation d'un client ; le calcul des
 * créneaux, la fenêtre de réservation et la liste d'attente viendront ici, et
 * nulle part ailleurs.
 */
export { normaliserEmail, normaliserNom, nomRecherche, cleClient } from './client';
