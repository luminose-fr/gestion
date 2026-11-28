/**
 * Les séances, vues de la console (SPEC §15.3, « Les séances »).
 *
 * Les lectures seulement : tout ce qui change l'agenda passe par
 * `decisions.ts`. Une séance sans fiche ou sans type se voit quand même
 * (règle 13 du chapitre 15) : jointures externes partout, et de l'identité
 * reçue ne sortent que le prénom et le nom — ni l'adresse, ni le téléphone.
 */

import { etatQuestionnaireSql } from './sensible';

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

/**
 * Une séance, sa personne, son type, ses mouvements, et la séance réalisée
 * qui la précède pour la même personne (« La dernière fois », refonte lot 4) :
 * trois instructions, un aller-retour. Du questionnaire, l'ÉTAT seulement.
 */
export const lireSeance = async (db: D1Database, id: string): Promise<{ seance: Brut; mouvements: Brut[]; precedente: Brut | null } | null> => {
  const [seance, mouvements, precedente] = await db.batch([
    db.prepare(`
      SELECT ${COLONNES}, s.provenance, s.questionnaire_id, t.nature AS type_nature, t.questionnaire_requis,
        c.origine AS client_origine, c.mot_cle_google_ads, ${etatQuestionnaireSql('s')} AS questionnaire
      FROM seances s
      LEFT JOIN clients c ON c.id = s.client_id
      LEFT JOIN types_seance t ON t.id = s.type_seance_id
      WHERE s.id = ?1`).bind(id),
    db.prepare(`
      SELECT id, nature, par, ancien_debut, nouveau_debut, revision, created_at
      FROM seances_mouvements WHERE seance_id = ?1 ORDER BY created_at, id`).bind(id),
    db.prepare(`
      SELECT p.id, p.debut FROM seances s JOIN seances p ON p.client_id = s.client_id
      WHERE s.id = ?1 AND p.id <> s.id AND p.statut = 'realisee' AND p.debut < s.debut
      ORDER BY p.debut DESC LIMIT 1`).bind(id),
  ]);
  const s = seance.results[0] as Brut | undefined;
  return s ? { seance: s, mouvements: mouvements.results as Brut[], precedente: (precedente.results[0] as Brut | undefined) ?? null } : null;
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

// ─── Avec qui un créneau se chevauche (refonte de la console, lot 4) ────────

/**
 * La séance prévue qui occupe déjà [debut, debut + durée + marge du type[ —
 * la même règle que `libre` dans decisions.ts. Lue SEULEMENT après un refus,
 * pour dire avec qui : le refus lui-même reste décidé par l'écriture, jamais
 * par cette lecture. Une instruction. `sauf` : la séance qui se déplace.
 */
export const quiOccupe = (
  db: D1Database, debut: number, dureeMin: number, typeId: string | null, sauf: string | null,
) => db.prepare(`
  SELECT autre.debut, autre.occupe_jusqua,
    COALESCE(c.prenom, json_extract(autre.identite_recue, '$.prenom')) AS prenom,
    COALESCE(c.nom, json_extract(autre.identite_recue, '$.nom')) AS nom
  FROM seances autre LEFT JOIN clients c ON c.id = autre.client_id
  WHERE autre.statut = 'prevue' AND autre.id <> COALESCE(?4, '')
    AND autre.debut < ?1 + (?2 + COALESCE((SELECT t.marge_apres_min FROM types_seance t WHERE t.id = ?3), 0)) * 60000
    AND autre.occupe_jusqua > ?1
  ORDER BY autre.debut LIMIT 1`).bind(debut, dureeMin, typeId, sauf)
  .first<{ debut: number; occupe_jusqua: number; prenom: string | null; nom: string | null }>();

/** Ce qu'une séance déjà posée apporte à cette lecture : son début, sa durée, son type. */
export const gabaritSeance = (db: D1Database, id: string) =>
  db.prepare('SELECT debut, duree_min, type_seance_id FROM seances WHERE id = ?1')
    .bind(id).first<{ debut: number; duree_min: number; type_seance_id: string | null }>();

// ─── Paiements (refonte de la console, lot 8) ───────────────────────────────

/** Les deux listes de l'écran Paiements, bornées. */
export const LIGNES_PAIEMENTS = 200;
export const JOURS_ENCAISSES = 92;

/**
 * À encaisser : les séances passées, réalisées ou manquées (une absence reste
 * due, décision du 28/11/2026), payables et pas payées — de la plus ancienne à
 * la plus récente. Encaissés : les séances payées des trois derniers mois, la
 * plus récente d'abord. Une instruction par liste, et le total à part : la
 * liste est bornée, le total ne l'est pas.
 */
export const lirePaiements = async (db: D1Database, vue: 'a_encaisser' | 'encaisses', maintenant: number) => {
  const condition = vue === 'a_encaisser'
    ? `s.statut IN ('realisee', 'absent') AND s.etat_paiement IN ('a_payer', 'attente_especes') AND s.debut < ?1`
    : `s.etat_paiement = 'payee' AND s.debut < ?1 AND s.debut >= ?1 - ${JOURS_ENCAISSES} * 86400000`;
  const [lignes, total] = await db.batch([
    db.prepare(`
      SELECT ${COLONNES}
      FROM seances s
      LEFT JOIN clients c ON c.id = s.client_id
      LEFT JOIN types_seance t ON t.id = s.type_seance_id
      WHERE ${condition}
      ORDER BY s.debut ${vue === 'a_encaisser' ? 'ASC' : 'DESC'}, s.id LIMIT ${LIGNES_PAIEMENTS}`).bind(maintenant),
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(s.montant_centimes), 0) AS centimes FROM seances s WHERE ${condition}`).bind(maintenant),
  ]);
  const t = total.results[0] as { n: number; centimes: number };
  return { lignes: lignes.results as Brut[], nombre: Number(t.n), centimes: Number(t.centimes) };
};

// ─── Rattacher une réservation à une fiche (refonte, lot 8) ─────────────────

/**
 * Les séances sans fiche — une réservation reçue « à rapprocher » (§14.4) —,
 * de la plus proche à la plus lointaine. Ce que la personne a envoyé (prénom,
 * nom, e-mail, téléphone) sert à choisir la bonne fiche : c'est l'écran de
 * Florent, et rien d'autre ne le lit. Une instruction.
 */
export const seancesARattacher = async (db: D1Database): Promise<Brut[]> => {
  const { results } = await db.prepare(`
    SELECT ${COLONNES},
      json_extract(s.identite_recue, '$.email') AS recu_email,
      json_extract(s.identite_recue, '$.telephone') AS recu_telephone
    FROM seances s
    LEFT JOIN clients c ON c.id = s.client_id
    LEFT JOIN types_seance t ON t.id = s.type_seance_id
    WHERE s.client_id IS NULL AND s.statut <> 'annulee'
    ORDER BY s.debut, s.id LIMIT 100`).all();
  return results as Brut[];
};

/**
 * Rattacher : la séance prend la fiche, si elle n'en a pas encore et que la
 * fiche existe ; l'alerte « à rapprocher » qui la désignait se résout dans le
 * même lot. `false` : rien d'écrit (déjà rattachée, ou l'une des deux absente).
 */
export const rattacherSeance = async (db: D1Database, id: string, clientId: string, maintenant: number): Promise<boolean> => {
  const [maj] = await db.batch([
    db.prepare(`UPDATE seances SET client_id = ?2, updated_at = ?3
      WHERE id = ?1 AND client_id IS NULL AND EXISTS (SELECT 1 FROM clients WHERE id = ?2)`).bind(id, clientId, maintenant),
    db.prepare(`UPDATE alertes SET resolue_le = ?2, updated_at = ?2
      WHERE sorte = 'a_rapprocher' AND objet_type = 'seance' AND objet_id = ?1 AND resolue_le IS NULL
        AND EXISTS (SELECT 1 FROM seances WHERE id = ?1 AND client_id IS NOT NULL)`).bind(id, maintenant),
  ]);
  return maj.meta.changes === 1;
};
