/**
 * Les séances, vues de la console (SPEC §15.3, « Les séances »).
 *
 * Les lectures seulement : tout ce qui change l'agenda passe par
 * `decisions.ts`. Une séance sans fiche ou sans type se voit quand même
 * (règle 13 du chapitre 15) : jointures externes partout, et de l'identité
 * reçue ne sortent que le prénom et le nom — ni l'adresse, ni le téléphone.
 */

type Brut = Record<string, unknown>;

/** Le prénom et le nom de la personne : sa fiche, sinon ce qu'elle a envoyé. */
const PERSONNE = `
  c.id AS client_id,
  COALESCE(c.prenom, json_extract(s.identite_recue, '$.prenom')) AS personne_prenom,
  COALESCE(c.nom, json_extract(s.identite_recue, '$.nom')) AS personne_nom`;

const COLONNES = `
  s.id, s.debut, s.duree_min, s.occupe_jusqua, s.revision, s.statut, s.etat_paiement, s.montant_centimes, s.mode,
  s.liste_attente, s.agenda_etat, s.origine, s.libelle_importe, s.created_at, s.updated_at,
  t.id AS type_id, t.cle AS type_cle, t.libelle AS type_libelle, ${PERSONNE}`;

/** Les séances de [du, au[, tous statuts, en UNE instruction. */
export const seancesDeLaPeriode = async (db: D1Database, du: number, au: number): Promise<Brut[]> => {
  const { results } = await db.prepare(`
    SELECT ${COLONNES}
    FROM seances s
    LEFT JOIN clients c ON c.id = s.client_id
    LEFT JOIN types_seance t ON t.id = s.type_seance_id
    WHERE s.debut >= ?1 AND s.debut < ?2
    ORDER BY s.debut, s.id`).bind(du, au).all();
  return results as Brut[];
};

/** Une séance, sa personne, son type, ses mouvements : deux instructions, un aller-retour. */
export const lireSeance = async (db: D1Database, id: string): Promise<{ seance: Brut; mouvements: Brut[] } | null> => {
  const [seance, mouvements] = await db.batch([
    db.prepare(`
      SELECT ${COLONNES}
      FROM seances s
      LEFT JOIN clients c ON c.id = s.client_id
      LEFT JOIN types_seance t ON t.id = s.type_seance_id
      WHERE s.id = ?1`).bind(id),
    db.prepare(`
      SELECT id, nature, par, ancien_debut, nouveau_debut, revision, created_at
      FROM seances_mouvements WHERE seance_id = ?1 ORDER BY created_at, id`).bind(id),
  ]);
  const s = seance.results[0] as Brut | undefined;
  return s ? { seance: s, mouvements: mouvements.results as Brut[] } : null;
};

/** L'état d'une séance, pour dire pourquoi une décision n'a rien écrit. */
export const etatSeance = (db: D1Database, id: string) =>
  db.prepare('SELECT statut, revision FROM seances WHERE id = ?1').bind(id).first<{ statut: string; revision: number }>();

/** Ce qu'un type apporte par défaut à un rendez-vous posé. */
export type GabaritType = {
  id: string; dureeMin: number; montantCentimes: number; etatPaiementDefaut: string; lieu: string;
};

export const gabaritType = async (db: D1Database, id: string): Promise<GabaritType | null> => {
  const t = await db.prepare(`
    SELECT id, duree_min, montant_centimes, etat_paiement_defaut, lieu FROM types_seance
    WHERE id = ?1 AND deleted_at IS NULL`).bind(id).first<Brut>();
  return t ? {
    id: String(t.id), dureeMin: Number(t.duree_min), montantCentimes: Number(t.montant_centimes),
    etatPaiementDefaut: String(t.etat_paiement_defaut), lieu: String(t.lieu),
  } : null;
};

// ─── Les liens d'une séance (SPEC §14.5) ────────────────────────────────────

/**
 * Ce que signe le lien de questionnaire d'une séance : son début (l'échéance —
 * choix du brief S2b, à confirmer) et sa version des liens. Une instruction ;
 * une séance annulée n'a pas de lien.
 */
export const seancePourUnLien = (db: D1Database, id: string) =>
  db.prepare("SELECT debut, liens_version FROM seances WHERE id = ?1 AND statut <> 'annulee'")
    .bind(id).first<{ debut: number; liens_version: number }>();

/** Révoquer tous les liens déjà envoyés pour une séance : avancer sa version. Une instruction. */
export const revoquerLesLiens = async (db: D1Database, id: string, maintenant: number): Promise<boolean> => {
  const r = await db.prepare('UPDATE seances SET liens_version = liens_version + 1, updated_at = ?2 WHERE id = ?1')
    .bind(id, maintenant).run();
  return r.meta.changes === 1;
};
