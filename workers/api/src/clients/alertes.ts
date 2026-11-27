/**
 * Les alertes : ce qui demande le regard de Florent (SPEC §14.6, Annexe C).
 *
 * Une alerte DÉSIGNE un objet, elle ne le décrit pas : une sorte, un type, un
 * identifiant — aucune valeur personnelle. L'écart d'une fiche se lit sur la
 * ligne reçue, pas dans l'alerte.
 *
 * La même alerte ne s'ouvre pas deux fois tant qu'elle n'est pas résolue : un
 * index unique partiel le garantit, et l'insertion s'efface devant lui
 * (`ON CONFLICT DO NOTHING`) au lieu de faire échouer le lot qui la porte.
 */
import { newId } from '../db';

export type SorteAlerte =
  | 'a_rapprocher'
  | 'a_revoir'
  | 'ecart_fiche'
  | 'second_questionnaire'
  | 'message_echec'
  | 'confirmation_contraire'
  | 'borne_atteinte'
  | 'modele_absent';

export type ObjetAlerte = { sorte: SorteAlerte; objetType: string; objetId: string };

/**
 * L'instruction qui ouvre une alerte, sous une condition. La condition peut
 * lire l'identifiant de l'objet en `?4` et l'instant en `?5` ; elle dit ce que
 * le lot a réellement écrit (« le questionnaire est à rapprocher »), pour que
 * l'alerte n'existe que si son objet est dans l'état qu'elle signale.
 *
 * `WHERE` est toujours présent : sans lui, SQLite lirait mal `ON CONFLICT`
 * après un `SELECT`.
 */
export const ouvrirAlerte = (db: D1Database, a: ObjetAlerte, maintenant: number, condition = '1') =>
  db.prepare(`
    INSERT INTO alertes (id, sorte, objet_type, objet_id, resolue_le, created_at, updated_at)
    SELECT ?1, ?2, ?3, ?4, NULL, ?5, ?5 WHERE (${condition})
    ON CONFLICT DO NOTHING`).bind(newId(), a.sorte, a.objetType, a.objetId, maintenant);

/** Une borne atteinte se signale sur le réglage qui la fixe. */
export const alerteBorne = (db: D1Database, reglage: string, maintenant: number) =>
  ouvrirAlerte(db, { sorte: 'borne_atteinte', objetType: 'reglage', objetId: reglage }, maintenant);
