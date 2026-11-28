/**
 * Les évènements et leurs inscriptions, vus de la console (SPEC §15.3).
 *
 * Les places occupées se comptent avec la définition du §14.4, À L'INSTANT
 * passé en paramètre — celle de `decisions.ts`, la seule. Les écritures qui
 * dépendent d'un compte (places, suppression, dernière place) y vivent aussi.
 */
import { placesOccupees, conditionPlaces } from './decisions';
import { newId } from '../db';
import { inscrireOrdre } from './ordres';

type Brut = Record<string, unknown>;

/** Les champs qu'une création ou une modification accepte. `publie` n'en est pas. */
export type ChampsEvenement = Partial<{
  nom: string;
  type: string | null;
  debut: number;
  fin: number | null;
  ville: string | null;
  placesTotales: number | null;
  prixCentimes: number | null;
  questionnaireRequis: boolean;
  urlInscription: string | null;
  metaDescription: string | null;
  htmlPermalink: string | null;
  htmlProgramme: string | null;
  htmlPrix: string | null;
  htmlLieuAdresse: string | null;
  htmlLieuInstructions: string | null;
}>;

const COLONNES: Record<keyof ChampsEvenement, string> = {
  nom: 'nom', type: 'type', debut: 'debut', fin: 'fin', ville: 'ville', placesTotales: 'places_totales',
  prixCentimes: 'prix_centimes', questionnaireRequis: 'questionnaire_requis', urlInscription: 'url_inscription',
  metaDescription: 'meta_description', htmlPermalink: 'html_permalink', htmlProgramme: 'html_programme',
  htmlPrix: 'html_prix', htmlLieuAdresse: 'html_lieu_adresse', htmlLieuInstructions: 'html_lieu_instructions',
};

const enValeur = (v: unknown) => (typeof v === 'boolean' ? (v ? 1 : 0) : v);

const CHAMPS_LISTE = `
  e.id, e.nom, e.type, e.debut, e.fin, e.ville, e.places_totales, e.prix_centimes, e.questionnaire_requis,
  e.url_inscription, e.publie, ${placesOccupees('e', '?1')} AS places_occupees`;

/** Tous les évènements non supprimés, avec leurs places, en UNE instruction. */
export const listeEvenements = async (db: D1Database, maintenant: number): Promise<Brut[]> => {
  const { results } = await db.prepare(`
    SELECT ${CHAMPS_LISTE} FROM evenements e WHERE e.deleted_at IS NULL ORDER BY e.debut DESC, e.id`)
    .bind(maintenant).all();
  return results as Brut[];
};

/** Un évènement et ses inscriptions, en un aller-retour. Avec ou sans fiche (règle 13). */
export const lireEvenement = async (
  db: D1Database, id: string, maintenant: number,
): Promise<{ evenement: Brut; inscriptions: Brut[] } | null> => {
  const [evenement, inscriptions] = await db.batch([
    db.prepare(`
      SELECT ${CHAMPS_LISTE}, e.meta_description, e.html_permalink, e.html_programme, e.html_prix,
        e.html_lieu_adresse, e.html_lieu_instructions, e.created_at, e.updated_at
      FROM evenements e WHERE e.id = ?2 AND e.deleted_at IS NULL`).bind(maintenant, id),
    db.prepare(`
      SELECT i.id, i.statut, i.mode_paiement, i.retenue_jusqua, i.montant_centimes, i.origine, i.created_at,
        (SELECT p.prestataire FROM paiements p WHERE p.inscription_id = i.id AND p.statut = 'reussi' ORDER BY p.reussi_le DESC LIMIT 1) AS paye_par,
        (SELECT p.reussi_le FROM paiements p WHERE p.inscription_id = i.id AND p.statut = 'reussi' ORDER BY p.reussi_le DESC LIMIT 1) AS paye_le,
        c.id AS client_id,
        COALESCE(c.prenom, json_extract(i.identite_recue, '$.prenom')) AS personne_prenom,
        COALESCE(c.nom, json_extract(i.identite_recue, '$.nom')) AS personne_nom
      FROM inscriptions i LEFT JOIN clients c ON c.id = i.client_id
      WHERE i.evenement_id = ?1
      ORDER BY i.created_at, i.id`).bind(id),
  ]);
  const e = evenement.results[0] as Brut | undefined;
  return e ? { evenement: e, inscriptions: inscriptions.results as Brut[] } : null;
};

export const creerEvenement = async (db: D1Database, id: string, champs: ChampsEvenement, maintenant: number) => {
  const valeurs: Record<string, unknown> = { id, created_at: maintenant, updated_at: maintenant };
  for (const [cle, colonne] of Object.entries(COLONNES)) {
    const v = champs[cle as keyof ChampsEvenement];
    if (v !== undefined) valeurs[colonne] = enValeur(v);
  }
  const colonnes = Object.keys(valeurs);
  await db.prepare(`INSERT INTO evenements (${colonnes.join(', ')}) VALUES (${colonnes.map((_, i) => `?${i + 1}`).join(', ')})`)
    .bind(...colonnes.map((c) => valeurs[c])).run();
};

/**
 * Modifie un évènement non supprimé. Si les places changent, l'écriture n'a
 * lieu que si elles restent au moins égales aux places occupées à cet instant :
 * la condition est dans l'instruction. Rend `false` si rien n'a été écrit.
 */
export const modifierEvenement = async (db: D1Database, id: string, champs: ChampsEvenement, maintenant: number): Promise<boolean> => {
  const valeurs: unknown[] = [id, maintenant];
  const param = (v: unknown) => { valeurs.push(v); return `?${valeurs.length}`; };
  const sets: string[] = [];
  let condition = '';
  for (const [cle, colonne] of Object.entries(COLONNES)) {
    const v = champs[cle as keyof ChampsEvenement];
    if (v === undefined) continue;
    const p = param(enValeur(v));
    sets.push(`${colonne} = ${p}`);
    if (cle === 'placesTotales') condition = ` AND ${conditionPlaces(p, '?2')}`;
  }
  const r = await db.prepare(`
    UPDATE evenements SET ${[...sets, 'updated_at = ?2'].join(', ')}
    WHERE id = ?1 AND deleted_at IS NULL${condition}`).bind(...valeurs).run();
  return r.meta.changes === 1;
};

/** L'évènement, pour dire pourquoi une écriture n'a rien écrit. */
export const etatEvenement = (db: D1Database, id: string) =>
  db.prepare('SELECT places_totales, deleted_at FROM evenements WHERE id = ?1').bind(id)
    .first<{ places_totales: number | null; deleted_at: number | null }>();

export const inscriptionExiste = async (db: D1Database, id: string): Promise<boolean> =>
  (await db.prepare('SELECT 1 AS un FROM inscriptions WHERE id = ?1').bind(id).first()) !== null;

/** Annulée ou déconseillée : une simple mise à jour, qui libère la place s'il y en avait une. */
export const changerStatutInscription = async (
  db: D1Database, id: string, statut: 'annulee' | 'deconseillee', maintenant: number,
): Promise<boolean> => {
  const r = await db.prepare('UPDATE inscriptions SET statut = ?2, updated_at = ?3 WHERE id = ?1').bind(id, statut, maintenant).run();
  return r.meta.changes === 1;
};

// ─── Encaisser une inscription à la main (refonte, lot 8) ───────────────────

/**
 * Florent a reçu le paiement d'un stage en espèces ou par virement (décision du
 * 28/11/2026 : le paiement en ligne passe par Stripe, bientôt Stancer ; le
 * reste se valide à la main). Un lot :
 *
 * 1. le paiement, `reussi`, du montant de l'inscription (sinon du prix du
 *    stage) — seulement si l'inscription existe, n'est pas annulée et n'a pas
 *    déjà un paiement réussi ;
 * 2. une inscription « retenue » (place gardée en attendant le paiement)
 *    devient « payée » ;
 * 3. l'ordre de la facture brouillon (`facture.qonto.creer`), qui attend que
 *    Make sache la créer : il n'est remis à personne tant que la remise ne
 *    connaît que les e-mails.
 *
 * `false` : rien d'écrit (absente, annulée, ou déjà payée).
 */
export const encaisserInscription = async (
  db: D1Database, inscriptionId: string, moyen: 'especes' | 'virement', maintenant: number,
): Promise<boolean> => {
  const paiementId = newId();
  const [paiement] = await db.batch([
    db.prepare(`
      INSERT INTO paiements (id, inscription_id, prestataire, reference, montant_centimes, statut, reussi_le, created_at, updated_at)
      SELECT ?1, i.id, ?3, ?1, COALESCE(i.montant_centimes, e.prix_centimes, 0), 'reussi', ?4, ?4, ?4
      FROM inscriptions i JOIN evenements e ON e.id = i.evenement_id
      WHERE i.id = ?2 AND i.statut NOT IN ('annulee', 'expiree', 'deconseillee')
        AND NOT EXISTS (SELECT 1 FROM paiements p WHERE p.inscription_id = i.id AND p.statut = 'reussi')`)
      .bind(paiementId, inscriptionId, moyen, maintenant),
    db.prepare(`UPDATE inscriptions SET statut = 'payee', updated_at = ?2
      WHERE id = ?1 AND statut = 'retenue' AND EXISTS (SELECT 1 FROM paiements WHERE id = ?3)`).bind(inscriptionId, maintenant, paiementId),
    inscrireOrdre(db, {
      sorte: 'facture.qonto.creer', modeleCle: null, objetType: 'paiement', objetId: paiementId,
      prevuLe: maintenant, cleUnicite: `facture:${paiementId}`,
    }, maintenant, 'EXISTS (SELECT 1 FROM paiements WHERE id = ?5)'),
  ]);
  return paiement.meta.changes === 1;
};

/**
 * Les inscriptions à encaisser, pour l'écran Paiements : une place gardée ou
 * confirmée, d'un stage payant, sans paiement réussi — du stage le plus proche
 * au plus lointain. L'identité par le prénom et le nom. Une instruction.
 */
export const inscriptionsAEncaisser = async (db: D1Database): Promise<Brut[]> => {
  const { results } = await db.prepare(`
    SELECT i.id, i.statut, i.mode_paiement, i.retenue_jusqua, COALESCE(i.montant_centimes, e.prix_centimes) AS montant,
      e.id AS evenement_id, e.nom AS evenement_nom, e.debut AS evenement_debut,
      c.id AS client_id,
      COALESCE(c.prenom, json_extract(i.identite_recue, '$.prenom')) AS personne_prenom,
      COALESCE(c.nom, json_extract(i.identite_recue, '$.nom')) AS personne_nom
    FROM inscriptions i JOIN evenements e ON e.id = i.evenement_id LEFT JOIN clients c ON c.id = i.client_id
    WHERE i.statut IN ('retenue', 'confirmee') AND e.deleted_at IS NULL AND COALESCE(i.montant_centimes, e.prix_centimes, 0) > 0
      AND NOT EXISTS (SELECT 1 FROM paiements p WHERE p.inscription_id = i.id AND p.statut = 'reussi')
    ORDER BY e.debut, i.created_at LIMIT 200`).all();
  return results as Brut[];
};
