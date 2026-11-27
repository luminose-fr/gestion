/**
 * Les ordres : ce que gestion demande à Make (SPEC §14.2, règle 9 ; §14.6).
 *
 * Gestion décide, Make exécute. Un ordre porte une sorte, l'objet concerné,
 * une échéance, un état et une clé d'unicité — **ni adresse, ni numéro, ni
 * texte** : le message se compose au départ, depuis le modèle et la fiche du
 * moment, et ne se range nulle part.
 */
import type { SorteOrdre } from '@luminose/contrat';
import { newId } from '../db';

export type NouvelOrdre = {
  sorte: SorteOrdre;
  /** Pour un message : la clé du modèle. */
  modeleCle: string | null;
  objetType: string;
  objetId: string;
  prevuLe: number;
  /** Une clé par effet : `accuse:<questionnaire>`… Un doublon s'efface devant elle. */
  cleUnicite: string;
};

/**
 * L'instruction qui inscrit un ordre, sous une condition qui peut lire
 * l'identifiant de l'objet en `?5` : l'ordre n'existe que si le lot a écrit son
 * objet. Un ordre de même clé déjà inscrit ne bouge pas.
 */
export const inscrireOrdre = (db: D1Database, o: NouvelOrdre, maintenant: number, condition = '1') =>
  db.prepare(`
    INSERT INTO ordres (id, sorte, modele_cle, objet_type, objet_id, prevu_le, etat, cle_unicite, tentatives, created_at, updated_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, 'prevu', ?7, 0, ?8, ?8 WHERE (${condition})
    ON CONFLICT DO NOTHING`).bind(newId(), o.sorte, o.modeleCle, o.objetType, o.objetId, o.prevuLe, o.cleUnicite, maintenant);
