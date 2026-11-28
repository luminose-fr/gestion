/**
 * Ce qui ne se décide qu'une fois (SPEC §14.2, règle 6 ; §14.4).
 *
 * Un créneau, la dernière place d'une journée : **jamais une lecture suivie
 * d'une écriture**. Entre les deux, une autre demande passerait. Chaque décision
 * est donc UNE instruction SQL conditionnelle, et le nombre de lignes qu'elle
 * écrit (`meta.changes`) dit son issue : 1, c'est fait ; 0, c'est refusé.
 *
 * Pas de `RETURNING` : `meta.changes` suffit, et l'adaptateur de test sur
 * `node:sqlite` ne rend pas les lignes d'un `INSERT … RETURNING`.
 *
 * Une instruction conditionnelle qui n'écrit rien n'est pas une erreur pour la
 * base : le lot continue. Les écritures qui dépendent de la décision — le
 * mouvement de la séance, la tentative de paiement d'une inscription — partent
 * donc dans le même `db.batch` (une transaction) et **portent la condition qui
 * les y lie**. Après un refus, il n'y a ni séance, ni mouvement ; une erreur au
 * milieu du lot l'annule en entier.
 *
 * Deux façons de lier, selon la décision :
 *   - une création : l'écriture qui suit exige l'existence de la ligne créée ;
 *   - un changement d'état (déplacer, rétablir) : l'existence ne prouve rien —
 *     la séance existait déjà, et une décision jouée deux fois la retrouverait
 *     dans l'état visé. Le mouvement s'écrit donc AVANT la décision, sous le
 *     MÊME prédicat, écrit une seule fois ci-dessous (`siDeplacable`,
 *     `siRetablissable`). Rien ne s'intercale entre les deux dans la
 *     transaction : ils voient la même base, et concluent pareil.
 *
 * La console (phase C1) les appelle ; la réservation et la porte publique
 * viendront ensuite. Les instructions utilisent des paramètres numérotés
 * (`?1`) : D1 ne connaît pas les paramètres nommés.
 */
import { newId } from '../db';
import type { Seance } from './db';

/** Qui fait le mouvement : Florent depuis la console, la personne elle-même, ou l'import. */
export type Auteur = 'florent' | 'personne' | 'import';

export type MotifRefus = 'creneau_pris' | 'complet';
export type Issue = { faite: true } | { faite: false; motif: MotifRefus };

/**
 * Un lot prêt à partir : ses instructions, la position de celle qui décide, et
 * le motif à rendre si elle n'écrit rien. Exposé pour que les tests puissent
 * prolonger un lot d'une instruction qui échoue.
 */
export type Lot = { instructions: D1PreparedStatement[]; decision: number; refus: MotifRefus };

/** Joue un lot en une transaction, et lit l'issue sur l'instruction qui décide. */
export const jouer = async (db: D1Database, lot: Lot): Promise<Issue> => {
  const resultats = await db.batch(lot.instructions);
  return resultats[lot.decision]?.meta.changes === 1 ? { faite: true } : { faite: false, motif: lot.refus };
};

const MINUTE = 60_000;

/** La marge du type d'une séance, en minutes ; 0 sans type. `type` : une expression SQL. */
const marge = (type: string) =>
  `COALESCE((SELECT t.marge_apres_min FROM types_seance t WHERE t.id = ${type}), 0)`;

/**
 * Personne d'autre n'occupe [debut, fin[ : aucune séance PRÉVUE ne commence
 * avant la fin et ne finit après le début. Une séance annulée, réalisée ou
 * manquée ne bloque rien ; deux séances qui se touchent sans se chevaucher sont
 * permises — la borne de fin est exclue. `sauf` : la séance qui se déplace,
 * exclue de la comparaison.
 */
const libre = (debut: string, fin: string, sauf?: string) => `NOT EXISTS (
  SELECT 1 FROM seances autre
  WHERE autre.statut = 'prevue' AND autre.debut < ${fin} AND autre.occupe_jusqua > ${debut}${sauf ? ` AND autre.id <> ${sauf}` : ''}
)`;

// ─── Entrer dans l'agenda : créer une séance prévue ─────────────────────────

export type NouvelleSeance = {
  id: string;
  /** Vide pour une séance « à rapprocher », qui garde alors l'identité reçue. */
  clientId: string | null;
  typeSeanceId: string | null;
  /** JSON : prénom, nom, e-mail, téléphone tels qu'envoyés. */
  identiteRecue?: string | null;
  debut: number;
  dureeMin: number;
  etatPaiement: 'a_payer' | 'attente_especes' | 'payee' | 'offerte' | 'annulee';
  montantCentimes: number;
  mode?: 'sur_place' | 'visio' | 'appel' | null;
  visioUrl?: string | null;
  origine: 'site' | 'console' | 'import';
  listeAttente?: boolean;
  conditionsAccepteesLe?: number | null;
  conditionsVersion?: number | null;
  questionnaireId?: string | null;
  clicAnnonce?: string | null;
  provenance?: string | null;
};

/**
 * `occupe_jusqua` = début + durée + marge du type, calculé par l'instruction
 * même : la marge est lue dans la transaction, pas recopiée par l'appelant.
 */
/**
 * `cleClient` (réservation depuis le site, §14.4, « Désigner un client ») : la
 * fiche est désignée DANS l'instruction — celle qui porte cette clé si elle est
 * seule ; aucune s'il y en a plusieurs, et la séance reste « à rapprocher ».
 * Sans elle, `clientId` vaut tel quel (la console a choisi la fiche).
 */
export const lotCreation = (
  db: D1Database, s: NouvelleSeance, auteur: Auteur, maintenant: number, cleClient: string | null = null,
  /** Une condition de plus, en SQL : celle qui lie la séance à la commande d'une réservation (§14.12). */
  enPlus = '1',
): Lot => ({
  instructions: [
    db.prepare(`
      INSERT INTO seances (
        id, client_id, type_seance_id, identite_recue, debut, duree_min, occupe_jusqua,
        revision, statut, etat_paiement, montant_centimes, mode, visio_url, agenda_etat, liens_version,
        liste_attente, conditions_acceptees_le, conditions_version, questionnaire_id, origine,
        clic_annonce, provenance, created_at, updated_at
      )
      SELECT ?1,
        CASE WHEN ?19 IS NULL THEN ?2 ELSE (SELECT CASE WHEN COUNT(*) = 1 THEN MIN(c.id) END FROM clients c WHERE c.cle_client = ?19) END,
        ?3, ?4, ?5, ?6, borne.fin,
        0, 'prevue', ?7, ?8, ?9, ?10, 'a_ecrire', 1,
        ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18
      FROM (SELECT ?5 + (?6 + ${marge('?3')}) * ${MINUTE} AS fin) AS borne
      WHERE ${libre('?5', 'borne.fin')} AND (${enPlus})`).bind(
      s.id, s.clientId, s.typeSeanceId, s.identiteRecue ?? null, s.debut, s.dureeMin,
      s.etatPaiement, s.montantCentimes, s.mode ?? null, s.visioUrl ?? null,
      s.listeAttente ? 1 : 0, s.conditionsAccepteesLe ?? null, s.conditionsVersion ?? null, s.questionnaireId ?? null,
      s.origine, s.clicAnnonce ?? null, s.provenance ?? null, maintenant, cleClient,
    ),
    // Lié par l'existence de la séance : refusée, elle n'existe pas.
    db.prepare(`
      INSERT INTO seances_mouvements (id, seance_id, nature, par, ancien_debut, nouveau_debut, revision, created_at, updated_at)
      SELECT ?1, s.id, 'creee', ?3, NULL, s.debut, s.revision, ?4, ?4 FROM seances s WHERE s.id = ?2`)
      .bind(newId(), s.id, auteur, maintenant),
  ],
  decision: 0,
  refus: 'creneau_pris',
});

export const creerSeance = (db: D1Database, s: NouvelleSeance, auteur: Auteur, maintenant: number): Promise<Issue> =>
  jouer(db, lotCreation(db, s, auteur, maintenant));

// ─── Entrer dans l'agenda : déplacer une séance prévue ──────────────────────

/**
 * Le prédicat d'un déplacement, sur la ligne `x` : la séance ?1 est prévue, à
 * la révision attendue ?3, et le nouvel intervalle — début ?2, durée et marge
 * recalculées — est libre, elle-même exclue. La révision attendue fait qu'un
 * déplacement joué deux fois n'aboutit qu'une fois : le premier l'a avancée.
 */
const siDeplacable = (x: string) => `
  ${x}.id = ?1 AND ${x}.statut = 'prevue' AND ${x}.revision = ?3
  AND ${libre('?2', `?2 + (${x}.duree_min + ${marge(`${x}.type_seance_id`)}) * ${MINUTE}`, `${x}.id`)}`;

export type Deplacement = { seanceId: string; nouveauDebut: number; revisionAttendue: number };

export const lotDeplacement = (db: D1Database, d: Deplacement, auteur: Auteur, maintenant: number): Lot => ({
  instructions: [
    // Avant la décision, sous le même prédicat : il garde l'ancien début.
    db.prepare(`
      INSERT INTO seances_mouvements (id, seance_id, nature, par, ancien_debut, nouveau_debut, revision, created_at, updated_at)
      SELECT ?5, s.id, 'deplacee', ?6, s.debut, ?2, s.revision + 1, ?4, ?4 FROM seances s WHERE ${siDeplacable('s')}`)
      .bind(d.seanceId, d.nouveauDebut, d.revisionAttendue, maintenant, newId(), auteur),
    // Le rendez-vous de l'agenda Google est à réécrire à la nouvelle heure.
    db.prepare(`
      UPDATE seances SET
        debut = ?2,
        occupe_jusqua = ?2 + (duree_min + ${marge('seances.type_seance_id')}) * ${MINUTE},
        revision = revision + 1,
        agenda_etat = 'a_ecrire',
        updated_at = ?4
      WHERE ${siDeplacable('seances')}`)
      .bind(d.seanceId, d.nouveauDebut, d.revisionAttendue, maintenant),
  ],
  decision: 1,
  refus: 'creneau_pris',
});

export const deplacerSeance = (db: D1Database, d: Deplacement, auteur: Auteur, maintenant: number): Promise<Issue> =>
  jouer(db, lotDeplacement(db, d, auteur, maintenant));

// ─── Entrer dans l'agenda : remettre une séance à « prévue » ────────────────

/**
 * La séance ?1 est annulée, réalisée ou marquée absente, et son intervalle est
 * libre — une autre a pu le reprendre. Toute entrée dans le statut `prevue`
 * passe par la même condition (§14.4), d'où qu'elle vienne.
 */
const siRetablissable = (x: string) => `
  ${x}.id = ?1 AND ${x}.statut IN ('annulee', 'realisee', 'absent')
  AND ${libre(`${x}.debut`, `${x}.occupe_jusqua`, `${x}.id`)}`;

export const lotRetablissement = (db: D1Database, seanceId: string, auteur: Auteur, maintenant: number): Lot => ({
  instructions: [
    db.prepare(`
      INSERT INTO seances_mouvements (id, seance_id, nature, par, ancien_debut, nouveau_debut, revision, created_at, updated_at)
      SELECT ?3, s.id, 'retablie', ?4, NULL, s.debut, s.revision, ?2, ?2 FROM seances s WHERE ${siRetablissable('s')}`)
      .bind(seanceId, maintenant, newId(), auteur),
    db.prepare(`
      UPDATE seances SET statut = 'prevue', agenda_etat = 'a_ecrire', updated_at = ?2
      WHERE ${siRetablissable('seances')}`)
      .bind(seanceId, maintenant),
  ],
  decision: 1,
  refus: 'creneau_pris',
});

export const retablirSeance = (db: D1Database, seanceId: string, auteur: Auteur, maintenant: number): Promise<Issue> =>
  jouer(db, lotRetablissement(db, seanceId, auteur, maintenant));

// ─── Sortir de l'agenda : annuler une séance prévue ─────────────────────────

/**
 * Prévue → annulée, et son mouvement, dans un lot. Sortir de l'agenda ne se
 * dispute à personne : la seule condition est que la séance soit encore
 * prévue. Annulée deux fois, la seconde ne trouve plus rien — un seul
 * mouvement. Le rendez-vous de l'agenda Google est à retirer : `a_ecrire`.
 */
const siAnnulable = (x: string) => `${x}.id = ?1 AND ${x}.statut = 'prevue'`;

export const lotAnnulation = (db: D1Database, seanceId: string, auteur: Auteur, maintenant: number): Lot => ({
  instructions: [
    db.prepare(`
      INSERT INTO seances_mouvements (id, seance_id, nature, par, ancien_debut, nouveau_debut, revision, created_at, updated_at)
      SELECT ?3, s.id, 'annulee', ?4, s.debut, NULL, s.revision, ?2, ?2 FROM seances s WHERE ${siAnnulable('s')}`)
      .bind(seanceId, maintenant, newId(), auteur),
    db.prepare(`UPDATE seances SET statut = 'annulee', agenda_etat = 'a_ecrire', updated_at = ?2 WHERE ${siAnnulable('seances')}`)
      .bind(seanceId, maintenant),
  ],
  decision: 1,
  // Sans objet : une annulation sans effet n'est pas un créneau pris. L'appelant lit `faite`.
  refus: 'creneau_pris',
});

export const annulerSeance = (db: D1Database, seanceId: string, auteur: Auteur, maintenant: number): Promise<Issue> =>
  jouer(db, lotAnnulation(db, seanceId, auteur, maintenant));

// ─── Changer ce qu'une séance occupe, sur place ─────────────────────────────

export type ChangementSeance = {
  seanceId: string;
  /** Les champs simples : statut (`realisee`, `absent`), paiement, montant, mode, liste d'attente. */
  champs: Partial<{
    statut: 'realisee' | 'absent';
    etatPaiement: Seance['etatPaiement'];
    montantCentimes: number;
    mode: Seance['mode'];
    listeAttente: boolean;
  }>;
  /** Ce qui change l'intervalle : le type, la durée. */
  typeSeanceId?: string | null;
  dureeMin?: number;
};

/**
 * Une seule instruction (règle 11 du chapitre 15). Si le type ou la durée
 * change, la borne est recalculée — même début, nouvelle durée, marge du
 * NOUVEAU type — et, sur une séance prévue, l'écriture n'a lieu que si le
 * nouvel intervalle est libre, elle-même exclue : c'est la décision de
 * déplacement, sur place. Une séance qui n'est pas prévue ne bloque rien :
 * simple mise à jour, borne recalculée. Les autres champs voyagent dans la
 * même instruction : refusée, rien n'est écrit.
 */
export const changerSeance = async (db: D1Database, ch: ChangementSeance, maintenant: number): Promise<Issue> => {
  const sets: string[] = [];
  const valeurs: unknown[] = [ch.seanceId, maintenant];
  const param = (v: unknown) => { valeurs.push(v); return `?${valeurs.length}`; };
  const colonnes: Record<keyof ChangementSeance['champs'], string> = {
    statut: 'statut', etatPaiement: 'etat_paiement', montantCentimes: 'montant_centimes', mode: 'mode', listeAttente: 'liste_attente',
  };
  for (const [cle, colonne] of Object.entries(colonnes) as [keyof ChangementSeance['champs'], string][]) {
    const v = ch.champs[cle];
    if (v !== undefined) sets.push(`${colonne} = ${param(typeof v === 'boolean' ? (v ? 1 : 0) : v)}`);
  }
  const intervalle = ch.typeSeanceId !== undefined || ch.dureeMin !== undefined;
  let condition = '';
  if (intervalle) {
    const type = ch.typeSeanceId !== undefined ? param(ch.typeSeanceId) : 'seances.type_seance_id';
    const duree = ch.dureeMin !== undefined ? param(ch.dureeMin) : 'seances.duree_min';
    const fin = `seances.debut + (${duree} + ${marge(type)}) * ${MINUTE}`;
    sets.push(`type_seance_id = ${type}`, `duree_min = ${duree}`, `occupe_jusqua = ${fin}`, `agenda_etat = 'a_ecrire'`);
    condition = ` AND (seances.statut <> 'prevue' OR ${libre('seances.debut', fin, 'seances.id')})`;
  }
  if (sets.length === 0) return { faite: true };
  const r = await db.prepare(`UPDATE seances SET ${sets.join(', ')}, updated_at = ?2 WHERE seances.id = ?1${condition}`)
    .bind(...valeurs).run();
  return r.meta.changes === 1 ? { faite: true } : { faite: false, motif: 'creneau_pris' };
};

// ─── Prendre une place ──────────────────────────────────────────────────────

/**
 * Occupe une place, À L'INSTANT DE LA DÉCISION (§14.4) : une inscription payée
 * ou confirmée ; une retenue par virement, échue ou non — elle attend que
 * Florent tranche ; une retenue par carte dont le délai n'est pas passé. Une
 * retenue par carte échue ne compte plus, que la tâche planifiée l'ait déjà
 * marquée expirée ou non : l'instant est un paramètre (?1), jamais l'horloge de
 * la base, pour que la règle se teste.
 */
export const occupeUnePlace = (i: string, maintenant: string) => `(
    ${i}.statut IN ('payee', 'confirmee')
    OR (${i}.statut = 'retenue' AND ${i}.mode_paiement = 'virement')
    OR (${i}.statut = 'retenue' AND ${i}.mode_paiement = 'carte' AND ${i}.retenue_jusqua > ${maintenant})
  )`;

/** Le nombre de places occupées de l'évènement `e`, à l'instant `maintenant` (une expression SQL). */
export const placesOccupees = (e: string, maintenant: string) => `(
  SELECT COUNT(*) FROM inscriptions i
  WHERE i.evenement_id = ${e}.id AND ${occupeUnePlace('i', maintenant)}
)`;

const PLACES_OCCUPEES = placesOccupees('e', '?1');

export type NouvelleInscription = {
  id: string;
  evenementId: string;
  /** Vide pour une inscription « à rapprocher ». */
  clientId: string | null;
  statut: 'retenue' | 'payee' | 'confirmee';
  retenueJusqua?: number | null;
  modePaiement?: 'carte' | 'virement' | null;
  /**
   * Le prix est lu sur l'évènement, dans l'instruction (règle 9 du modèle) ;
   * l'appelant ne passe que la réduction vérifiée chez le prestataire.
   */
  reductionCentimes?: number;
  codePromo?: string | null;
  questionnaireId?: string | null;
  /** Tirée au hasard par l'appelant : sans signification. */
  reference: string;
  identiteRecue?: string | null;
  provenance?: string | null;
  origine: 'site' | 'console' | 'import';
};

/** La tentative de paiement qui accompagne une inscription : écrite seulement si la place est prise. */
export type TentativePaiement = {
  prestataire: 'stancer' | 'stripe' | 'virement' | 'especes';
  reference: string;
  test: boolean;
};

export const lotInscription = (
  db: D1Database,
  ins: NouvelleInscription,
  maintenant: number,
  paiement?: TentativePaiement,
): Lot => {
  const instructions = [
    db.prepare(`
      INSERT INTO inscriptions (
        id, evenement_id, client_id, statut, retenue_jusqua, mode_paiement, montant_centimes, code_promo,
        questionnaire_id, reference, identite_recue, liens_version, provenance, origine, created_at, updated_at
      )
      SELECT ?2, e.id, ?4, ?5, ?6, ?7,
        CASE WHEN e.prix_centimes IS NULL THEN NULL ELSE MAX(e.prix_centimes - ?8, 0) END,
        ?9, ?10, ?11, ?12, 1, ?13, ?14, ?1, ?1
      FROM evenements e
      WHERE e.id = ?3 AND e.deleted_at IS NULL AND e.places_totales IS NOT NULL
        AND ${PLACES_OCCUPEES} < e.places_totales`).bind(
      maintenant, ins.id, ins.evenementId, ins.clientId, ins.statut, ins.retenueJusqua ?? null, ins.modePaiement ?? null,
      ins.reductionCentimes ?? 0, ins.codePromo ?? null, ins.questionnaireId ?? null, ins.reference,
      ins.identiteRecue ?? null, ins.provenance ?? null, ins.origine,
    ),
  ];
  if (paiement) {
    // Lié par l'existence de l'inscription : refusée, elle n'existe pas.
    instructions.push(db.prepare(`
      INSERT INTO paiements (id, seance_id, inscription_id, prestataire, reference, montant_centimes, devise, statut, test, created_at, updated_at)
      SELECT ?1, NULL, i.id, ?3, ?4, COALESCE(i.montant_centimes, 0), 'EUR', 'cree', ?5, ?6, ?6
      FROM inscriptions i WHERE i.id = ?2`)
      .bind(newId(), ins.id, paiement.prestataire, paiement.reference, paiement.test ? 1 : 0, maintenant));
  }
  return { instructions, decision: 0, refus: 'complet' };
};

export const prendrePlace = (
  db: D1Database,
  ins: NouvelleInscription,
  maintenant: number,
  paiement?: TentativePaiement,
): Promise<Issue> => jouer(db, lotInscription(db, ins, maintenant, paiement));

// ─── Reprendre une place : une inscription qui revient ──────────────────────

/**
 * Remettre une inscription à « confirmée » (règle 12 du chapitre 15). Si elle
 * occupe déjà une place à cet instant — payée, confirmée, retenue par virement,
 * retenue par carte dans son délai —, elle la garde : simple changement de
 * statut. Sinon — annulée, déconseillée, expirée, retenue par carte échue —,
 * elle doit la reprendre, et c'est la décision de la dernière place : l'écriture
 * n'a lieu que si l'évènement n'est pas supprimé, a un nombre de places, et en a
 * une de libre. Une seule instruction. L'index des inscriptions vivantes refuse
 * qu'une fiche y revienne si elle y a déjà une autre inscription vivante : à
 * l'appelant de le rendre en refus.
 */
export const confirmerInscription = async (db: D1Database, inscriptionId: string, maintenant: number): Promise<Issue> => {
  const r = await db.prepare(`
    UPDATE inscriptions SET statut = 'confirmee', updated_at = ?1
    WHERE id = ?2 AND (
      ${occupeUnePlace('inscriptions', '?1')}
      OR EXISTS (
        SELECT 1 FROM evenements e
        WHERE e.id = inscriptions.evenement_id AND e.deleted_at IS NULL AND e.places_totales IS NOT NULL
          AND ${PLACES_OCCUPEES} < e.places_totales
      )
    )`).bind(maintenant, inscriptionId).run();
  return r.meta.changes === 1 ? { faite: true } : { faite: false, motif: 'complet' };
};

// ─── Les places et la vie d'un évènement ────────────────────────────────────

/**
 * Les places ne descendent pas sous l'occupation : la condition est DANS
 * l'écriture, comptée à l'instant de la décision — pas dans une lecture
 * d'avant, qu'une inscription concurrente rendrait fausse.
 */
export const conditionPlaces = (parametrePlaces: string, parametreMaintenant: string) =>
  `(${parametrePlaces} IS NULL OR ${parametrePlaces} >= ${placesOccupees('evenements', parametreMaintenant)})`;

/** Suppression logique, refusée s'il a une inscription, quelle qu'elle soit — dans la même instruction. */
export const supprimerEvenement = async (db: D1Database, evenementId: string, maintenant: number): Promise<boolean> => {
  const r = await db.prepare(`
    UPDATE evenements SET deleted_at = ?2, updated_at = ?2
    WHERE id = ?1 AND deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM inscriptions i WHERE i.evenement_id = evenements.id)`)
    .bind(evenementId, maintenant).run();
  return r.meta.changes === 1;
};
