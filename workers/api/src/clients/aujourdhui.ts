/**
 * L'écran Aujourd'hui (refonte de la console, lot 3 — docs/refonte/01, §3).
 *
 * Une lecture groupée, en UN aller-retour de cinq instructions, chacune
 * bornée : son nombre de requêtes ne dépend pas du volume (CLAUDE.md, « Pas
 * de N+1 »).
 *
 * **Règle d'admission d'À traiter.** Une ligne n'y entre que si elle attend un
 * geste de Florent, mène à UN écran où ce geste se fait, et disparaît quand il
 * est fait. D'où, pour l'instant, deux sortes seulement, faites toutes deux
 * dans l'écran de la séance :
 *
 * - « Clore la séance restée prévue » : une séance passée, encore `prevue` ;
 *   elle sort dès qu'on lui donne un statut.
 * - « Écrire les notes » : une séance réalisée des quatorze derniers jours,
 *   sans notes ; elle sort à la première frappe enregistrée.
 *
 * - « Relire le questionnaire » (lot 8) : reçu, pas relu, pour une séance des
 *   sept prochains jours ; elle sort quand on le marque relu.
 *
 * La réservation à rattacher et les autres alertes entreront avec leurs
 * écrans : une ligne qui mène à une impasse apprend à ne plus lire la liste.
 *
 * Des listes : l'état d'une note ou d'un questionnaire, jamais leur contenu
 * (04, §4) — les deux fragments viennent de `sensible.ts`.
 */
import { etatQuestionnaireSql, notesEcritesSql } from './sensible';

type Brut = Record<string, unknown>;

/** Le soir, le lendemain matin s'ajoute à la journée. */
export const HEURE_DU_SOIR = 18;
/** Les notes s'attendent deux semaines ; au-delà, la séance n'est plus « à traiter ». */
export const JOURS_DES_NOTES = 14;
/** Une séance restée « prévue » se signale deux mois ; au-delà, c'est de l'historique. */
export const JOURS_DES_SEANCES_PREVUES = 60;
/** Ce que chaque sorte d'À traiter rend au plus. */
export const LIGNES_PAR_SORTE = 30;

const SEANCE = `
  s.id, s.debut, s.duree_min, s.statut, s.etat_paiement, s.mode, s.provenance, s.libelle_importe, s.questionnaire_id,
  t.id AS type_id, t.cle AS type_cle, t.libelle AS type_libelle, t.nature AS type_nature, t.questionnaire_requis,
  c.id AS client_id, c.origine AS client_origine, c.mot_cle_google_ads,
  COALESCE(c.prenom, json_extract(s.identite_recue, '$.prenom')) AS personne_prenom,
  COALESCE(c.nom, json_extract(s.identite_recue, '$.nom')) AS personne_nom`;

const JOINTURES = `
  FROM seances s
  LEFT JOIN clients c ON c.id = s.client_id
  LEFT JOIN types_seance t ON t.id = s.type_seance_id`;

const FIN = `(s.debut + s.duree_min * 60000)`;

/** Un questionnaire non relu se signale une semaine avant sa séance. */
export const JOURS_DU_QUESTIONNAIRE = 7;

export type LectureAujourdhui = { journee: Brut[]; prochaine: Brut | null; aClore: Brut[]; notes: Brut[]; aRelire: Brut[] };

/**
 * `du`–`au` : la journée affichée (le lendemain midi s'y ajoute le soir, c'est
 * l'appelant qui le décide). `maintenant` sépare le passé de l'avenir.
 */
export const lireAujourdhui = async (db: D1Database, du: number, au: number, maintenant: number): Promise<LectureAujourdhui> => {
  const [journee, prochaine, aClore, notes, aRelire] = await db.batch([
    db.prepare(`
      SELECT ${SEANCE}, ${etatQuestionnaireSql('s')} AS questionnaire, ${notesEcritesSql('s')} AS notes_ecrites
      ${JOINTURES}
      WHERE s.debut >= ?1 AND s.debut < ?2 AND s.statut <> 'annulee'
      ORDER BY s.debut, s.id LIMIT 40`).bind(du, au),
    // La prochaine séance : celle qui est en cours, sinon la suivante.
    db.prepare(`
      SELECT ${SEANCE}, ${etatQuestionnaireSql('s')} AS questionnaire
      ${JOINTURES}
      WHERE s.statut = 'prevue' AND ${FIN} > ?1
      ORDER BY s.debut, s.id LIMIT 1`).bind(maintenant),
    db.prepare(`
      SELECT ${SEANCE}
      ${JOINTURES}
      WHERE s.statut = 'prevue' AND ${FIN} <= ?1 AND s.debut >= ?2
      ORDER BY s.debut, s.id LIMIT ${LIGNES_PAR_SORTE}`).bind(maintenant, maintenant - JOURS_DES_SEANCES_PREVUES * 86_400_000),
    db.prepare(`
      SELECT ${SEANCE}
      ${JOINTURES}
      WHERE s.statut = 'realisee' AND ${FIN} <= ?1 AND s.debut >= ?2 AND NOT ${notesEcritesSql('s')}
      ORDER BY s.debut, s.id LIMIT ${LIGNES_PAR_SORTE}`).bind(maintenant, maintenant - JOURS_DES_NOTES * 86_400_000),
    // Un questionnaire reçu et pas relu, pour une séance des sept prochains jours (lot 8 : l'écran existe).
    db.prepare(`
      SELECT ${SEANCE}
      ${JOINTURES}
      WHERE s.statut = 'prevue' AND s.debut >= ?1 AND s.debut < ?2 AND ${etatQuestionnaireSql('s')} = 'non_relu'
      ORDER BY s.debut, s.id LIMIT ${LIGNES_PAR_SORTE}`).bind(maintenant, maintenant + JOURS_DU_QUESTIONNAIRE * 86_400_000),
  ]);
  return {
    journee: journee.results as Brut[],
    prochaine: (prochaine.results[0] as Brut | undefined) ?? null,
    aClore: aClore.results as Brut[],
    notes: notes.results as Brut[],
    aRelire: aRelire.results as Brut[],
  };
};

/**
 * D'où vient la personne, en une ligne — pour un entretien préalable
 * seulement (01, §3). La séance d'abord (ce que le site a reçu à la
 * réservation), puis la fiche. Le mot-clé n'arrive du site que par
 * `utm_term` : un clic d'annonce seul ne le donne pas (02, T2).
 */
export const provenanceEnClair = (s: Brut): string | null => {
  let recue: { clic?: { type?: string }; utm?: Record<string, string> } | null = null;
  try { recue = s.provenance ? JSON.parse(String(s.provenance)) : null; } catch { recue = null; }
  const utm = recue?.utm ?? {};
  const motCle = utm.utm_term || (s.mot_cle_google_ads ? String(s.mot_cle_google_ads) : '');
  const google = recue?.clic?.type === 'gclid' || /google/i.test(utm.utm_source ?? '') || /google/i.test(String(s.client_origine ?? ''));
  const source = google ? 'Google Ads' : (utm.utm_source || (s.client_origine ? String(s.client_origine) : ''));
  if (!source && !motCle) return null;
  return [source, motCle ? `mot-clé : ${motCle}` : ''].filter(Boolean).join(' · ');
};
