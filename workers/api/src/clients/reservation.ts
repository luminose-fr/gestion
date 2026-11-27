/**
 * Les réglages de la réservation (SPEC §15.3) : les types, la semaine type,
 * les dates d'exception, les réglages. Des tables sans personne : la
 * suppression y est logique, et une semaine ou une date se remplace en un lot.
 */
import { newId } from '../db';

type Brut = Record<string, unknown>;

/** Les clés de `reglages` que la console peut changer. Une phase qui en ajoute les ajoute ici. */
export const REGLAGES_CONNUS = [
  'rappel_email_avant_h', 'rappel_sms_avant_h', 'retenue_carte_h', 'retenue_virement_h',
  'liste_attente_creneau_min_h', 'liste_attente_seance_min_h', 'liste_attente_personnes_max',
] as const;
export type CleReglage = (typeof REGLAGES_CONNUS)[number];

/** Les types, la semaine, les dates à venir et les réglages : une lecture groupée de quatre instructions. */
export const lireReservation = async (db: D1Database, aPartirDu: string) => {
  const [types, semaine, dates, reglages] = await db.batch([
    db.prepare(`
      SELECT id, cle, libelle, nature, duree_min, marge_apres_min, pas_min, lieu, montant_centimes, etat_paiement_defaut,
        questionnaire_requis, conditions_annulation, liste_attente_proposee, fenetre_debut_h, fenetre_fin_h,
        reservable_en_ligne, actif, ordre
      FROM types_seance WHERE deleted_at IS NULL ORDER BY ordre, cle`),
    db.prepare('SELECT id, jour, debut, fin FROM horaires WHERE deleted_at IS NULL ORDER BY jour, debut'),
    db.prepare(`
      SELECT id, date, debut, fin FROM horaires_dates
      WHERE deleted_at IS NULL AND date >= ?1 ORDER BY date, debut`).bind(aPartirDu),
    db.prepare('SELECT cle, valeur FROM reglages ORDER BY cle'),
  ]);
  return {
    types: types.results as Brut[], semaine: semaine.results as Brut[],
    dates: dates.results as Brut[], reglages: reglages.results as Brut[],
  };
};

export type ChampsType = Partial<{
  dureeMin: number; margeApresMin: number; pasMin: number; lieu: 'sur_place' | 'visio' | 'visio_ou_appel';
  montantCentimes: number; fenetreDebutH: number; fenetreFinH: number;
  reservableEnLigne: boolean; actif: boolean; ordre: number;
}>;

const COLONNES_TYPE: Record<keyof ChampsType, string> = {
  dureeMin: 'duree_min', margeApresMin: 'marge_apres_min', pasMin: 'pas_min', lieu: 'lieu',
  montantCentimes: 'montant_centimes', fenetreDebutH: 'fenetre_debut_h', fenetreFinH: 'fenetre_fin_h',
  reservableEnLigne: 'reservable_en_ligne', actif: 'actif', ordre: 'ordre',
};

/** La clé d'un type ne change pas : elle n'est pas dans la liste. */
export const modifierType = async (db: D1Database, id: string, champs: ChampsType, maintenant: number): Promise<boolean> => {
  const sets: string[] = [];
  const valeurs: unknown[] = [id, maintenant];
  for (const [cle, colonne] of Object.entries(COLONNES_TYPE)) {
    const v = champs[cle as keyof ChampsType];
    if (v === undefined) continue;
    valeurs.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
    sets.push(`${colonne} = ?${valeurs.length}`);
  }
  const r = await db.prepare(`UPDATE types_seance SET ${[...sets, 'updated_at = ?2'].join(', ')} WHERE id = ?1 AND deleted_at IS NULL`)
    .bind(...valeurs).run();
  return r.meta.changes === 1;
};

export type PlageJour = { jour: number; debut: string; fin: string };

/** Remplace la semaine type en un lot : l'ancienne est retirée (logiquement), la nouvelle posée. */
export const remplacerSemaine = async (db: D1Database, plages: PlageJour[], maintenant: number) => {
  await db.batch([
    db.prepare('UPDATE horaires SET deleted_at = ?1, updated_at = ?1 WHERE deleted_at IS NULL').bind(maintenant),
    ...plages.map((p) => db.prepare(`
      INSERT INTO horaires (id, jour, debut, fin, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)`)
      .bind(newId(), p.jour, p.debut, p.fin, maintenant)),
  ]);
};

/**
 * Les plages d'une date, en un lot. Une liste vide ferme la journée : une
 * ligne sans plage (`debut` et `fin` vides), comme le schéma le prévoit.
 */
export const poserDate = async (db: D1Database, date: string, plages: { debut: string; fin: string }[], maintenant: number) => {
  const lignes = plages.length === 0 ? [{ debut: null, fin: null }] : plages;
  await db.batch([
    db.prepare('UPDATE horaires_dates SET deleted_at = ?2, updated_at = ?2 WHERE date = ?1 AND deleted_at IS NULL').bind(date, maintenant),
    ...lignes.map((p) => db.prepare(`
      INSERT INTO horaires_dates (id, date, debut, fin, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)`)
      .bind(newId(), date, p.debut, p.fin, maintenant)),
  ]);
};

/** Retirer l'exception rend la date à la semaine type. */
export const retirerDate = async (db: D1Database, date: string, maintenant: number): Promise<boolean> => {
  const r = await db.prepare('UPDATE horaires_dates SET deleted_at = ?2, updated_at = ?2 WHERE date = ?1 AND deleted_at IS NULL')
    .bind(date, maintenant).run();
  return r.meta.changes > 0;
};

/** Les réglages, par clé connue, en un lot. */
export const modifierReglages = async (db: D1Database, valeurs: Partial<Record<CleReglage, number>>, maintenant: number) => {
  const entrees = Object.entries(valeurs).filter(([, v]) => v !== undefined);
  if (entrees.length === 0) return;
  await db.batch(entrees.map(([cle, v]) =>
    db.prepare('UPDATE reglages SET valeur = ?2, updated_at = ?3 WHERE cle = ?1').bind(cle, v, maintenant)));
};
