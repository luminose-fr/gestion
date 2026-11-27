/**
 * Les séances, vues de la console (SPEC §15.3) — `/api/seances`.
 *
 * L'agenda ne se modifie que par ses décisions (§15.2, règle 6) : poser,
 * déplacer, remettre à « prévue », changer le type ou la durée d'une séance
 * prévue. Un chevauchement est refusé, y compris à Florent ; lui seul passe
 * outre la fenêtre et les horaires — aucune vérification de fenêtre ici.
 * Rien n'est écrit dans l'agenda Google : une séance posée garde
 * `agenda_etat = 'a_ecrire'`, et aucun message ne part.
 */
import { z } from 'zod';
import { instantDeParis, jourSuivant } from '@luminose/pratique';
import { baseClients } from '../clients/base';
import { newId } from '../db';
import { Refus } from '../refus';
import { creerSeance, deplacerSeance, retablirSeance, annulerSeance, changerSeance } from '../clients/decisions';
import { seancesDeLaPeriode, lireSeance, etatSeance, gabaritType, seancePourUnLien, revoquerLesLiens } from '../clients/seances';
import { secretDesPortes, signerJeton } from '../clients/jetons';
import { lireNotesSeance, ecrireNotesSeance } from '../clients/sensible';
import { famille, corps, valider, dateSimple, identifiant, instantIso, iso } from './clients-commun';
import { MESSAGE_NOTE_MODIFIEE } from './clients';

export const seances = famille();

export const MESSAGE_CHEVAUCHEMENT = 'Ce créneau chevauche un autre rendez-vous.';
const SEANCE_INTROUVABLE = 'Cette séance n’existe pas.';
const JOURS_MAX = 62;

type Brut = Record<string, unknown>;

/** Une séance telle que la console la lit : la personne par son prénom et son nom, jamais plus. */
const enSortie = (s: Brut) => ({
  id: s.id, debut: iso(s.debut as number), fin: iso((s.debut as number) + Number(s.duree_min) * 60_000),
  occupeJusqua: iso(s.occupe_jusqua as number), dureeMin: s.duree_min, revision: s.revision,
  statut: s.statut, etatPaiement: s.etat_paiement, montantCentimes: s.montant_centimes, mode: s.mode,
  listeAttente: Number(s.liste_attente) === 1, agendaEtat: s.agenda_etat, origine: s.origine,
  type: s.type_id ? { id: s.type_id, cle: s.type_cle, libelle: s.type_libelle } : null,
  libelleImporte: s.libelle_importe,
  personne: { clientId: s.client_id ?? null, prenom: s.personne_prenom ?? null, nom: s.personne_nom ?? null },
});

const Periode = z.strictObject({ du: dateSimple, au: dateSimple });

/** Les dates d'une période sont des jours, pas des personnes : elles peuvent être dans l'adresse. */
seances.get('/', async (c) => {
  const { du, au } = valider(Periode, c.req.query());
  const debut = instantDeParis(du, '00:00');
  const fin = instantDeParis(jourSuivant(au), '00:00');
  if (fin <= debut) throw new Refus('La fin de la période précède son début.', 400);
  if (fin - debut > (JOURS_MAX + 1) * 24 * 3_600_000) throw new Refus(`Une période couvre ${JOURS_MAX} jours au plus.`, 400);
  return c.json({ seances: (await seancesDeLaPeriode(baseClients(c.env), debut, fin)).map(enSortie) });
});

seances.get('/:id', async (c) => {
  const lue = await lireSeance(baseClients(c.env), c.req.param('id'));
  if (!lue) throw new Refus(SEANCE_INTROUVABLE, 404);
  return c.json({
    ...enSortie(lue.seance),
    creeeLe: iso(lue.seance.created_at as number),
    mouvements: lue.mouvements.map((m) => ({
      id: m.id, nature: m.nature, par: m.par, ancienDebut: iso(m.ancien_debut as number | null),
      nouveauDebut: iso(m.nouveau_debut as number | null), revision: m.revision, le: iso(m.created_at as number),
    })),
  });
});

// ─── Les notes (règles 4 et 7) ──────────────────────────────────────────────

// Un seul texte Markdown (clients/notes.ts) ; vide, il s'enregistre comme rien.
const EcritureNotes = z.strictObject({
  texte: z.string().max(100_000).nullable(),
  version: z.number().int().nonnegative().nullable(),
});

seances.get('/:id/notes', async (c) => {
  const db = baseClients(c.env);
  const id = c.req.param('id');
  if (!(await etatSeance(db, id))) throw new Refus(SEANCE_INTROUVABLE, 404);
  return c.json(await lireNotesSeance(db, id));
});

seances.put('/:id/notes', async (c) => {
  const db = baseClients(c.env);
  const id = c.req.param('id');
  const { texte, version } = await corps(c, EcritureNotes);
  const issue = await ecrireNotesSeance(db, id, texte?.trim() ? texte : null, version, Date.now(), newId());
  if (issue.ecrite) return c.json({ version: issue.version });
  if (!(await etatSeance(db, id))) throw new Refus(SEANCE_INTROUVABLE, 404);
  throw new Refus(MESSAGE_NOTE_MODIFIEE, 409);
});

// ─── Poser un rendez-vous ───────────────────────────────────────────────────

const MODES = ['sur_place', 'visio', 'appel'] as const;
const PAIEMENTS = ['a_payer', 'attente_especes', 'payee', 'offerte', 'annulee'] as const;

const Pose = z.strictObject({
  clientId: identifiant,
  typeSeanceId: identifiant,
  debut: instantIso,
  dureeMin: z.number().int().min(5).max(24 * 60).optional(),
  mode: z.enum(MODES).optional(),
  montantCentimes: z.number().int().min(0).max(10_000_000).optional(),
});

/** Le mode par défaut d'un type, d'après son lieu. */
const modeDuLieu = (lieu: string): (typeof MODES)[number] => (lieu === 'sur_place' ? 'sur_place' : 'visio');

seances.post('/', async (c) => {
  const db = baseClients(c.env);
  const pose = await corps(c, Pose);
  const type = await gabaritType(db, pose.typeSeanceId);
  if (!type) throw new Refus('Ce type de séance n’existe pas.', 400);
  const id = newId();
  const issue = await creerSeance(db, {
    id, clientId: pose.clientId, typeSeanceId: type.id, debut: pose.debut,
    dureeMin: pose.dureeMin ?? type.dureeMin,
    etatPaiement: type.etatPaiementDefaut as (typeof PAIEMENTS)[number],
    montantCentimes: pose.montantCentimes ?? type.montantCentimes,
    mode: pose.mode ?? modeDuLieu(type.lieu),
    origine: 'console',
  }, 'florent', Date.now());
  if (!issue.faite) throw new Refus(MESSAGE_CHEVAUCHEMENT, 409);
  return c.json({ id }, 201);
});

// ─── Déplacer, annuler, remettre à « prévue » ───────────────────────────────

const Deplacement = z.strictObject({ debut: instantIso, revision: z.number().int().nonnegative() });

seances.post('/:id/deplacer', async (c) => {
  const db = baseClients(c.env);
  const id = c.req.param('id');
  const { debut, revision } = await corps(c, Deplacement);
  const issue = await deplacerSeance(db, { seanceId: id, nouveauDebut: debut, revisionAttendue: revision }, 'florent', Date.now());
  if (issue.faite) return c.json({ id });
  // Rien d'écrit : dire pourquoi, sans rien décider sur cette lecture.
  const etat = await etatSeance(db, id);
  if (!etat) throw new Refus(SEANCE_INTROUVABLE, 404);
  if (etat.statut !== 'prevue') throw new Refus('Seule une séance prévue se déplace.', 409);
  if (Number(etat.revision) !== revision) throw new Refus('Cette séance a changé depuis son affichage. Rechargez-la.', 409);
  throw new Refus(MESSAGE_CHEVAUCHEMENT, 409);
});

seances.post('/:id/annuler', async (c) => {
  const db = baseClients(c.env);
  const id = c.req.param('id');
  const issue = await annulerSeance(db, id, 'florent', Date.now());
  if (!issue.faite && !(await etatSeance(db, id))) throw new Refus(SEANCE_INTROUVABLE, 404);
  // Annuler une séance qui n'est plus prévue est sans effet : `fait` le dit.
  return c.json({ id, fait: issue.faite });
});

seances.post('/:id/prevoir', async (c) => {
  const db = baseClients(c.env);
  const id = c.req.param('id');
  const issue = await retablirSeance(db, id, 'florent', Date.now());
  if (issue.faite) return c.json({ id });
  const etat = await etatSeance(db, id);
  if (!etat) throw new Refus(SEANCE_INTROUVABLE, 404);
  if (etat.statut === 'prevue') throw new Refus('Cette séance est déjà prévue.', 409);
  throw new Refus(MESSAGE_CHEVAUCHEMENT, 409);
});

// ─── Modifier une séance ────────────────────────────────────────────────────

/** Jamais le début (c'est un déplacement), jamais `prevue` (c'est « remettre à prévue »), jamais `annulee`. */
const Modification = z.strictObject({
  statut: z.enum(['realisee', 'absent']).optional(),
  etatPaiement: z.enum(PAIEMENTS).optional(),
  montantCentimes: z.number().int().min(0).max(10_000_000).optional(),
  mode: z.enum(MODES).nullable().optional(),
  listeAttente: z.boolean().optional(),
  typeSeanceId: identifiant.nullable().optional(),
  dureeMin: z.number().int().min(5).max(24 * 60).optional(),
});

seances.patch('/:id', async (c) => {
  const db = baseClients(c.env);
  const id = c.req.param('id');
  const { typeSeanceId, dureeMin, ...champs } = await corps(c, Modification);
  if (typeSeanceId && !(await gabaritType(db, typeSeanceId))) throw new Refus('Ce type de séance n’existe pas.', 400);
  const issue = await changerSeance(db, { seanceId: id, champs, typeSeanceId, dureeMin }, Date.now());
  if (issue.faite) return c.json({ id });
  if (!(await etatSeance(db, id))) throw new Refus(SEANCE_INTROUVABLE, 404);
  throw new Refus(MESSAGE_CHEVAUCHEMENT, 409);
});

// ─── Les liens d'une séance (SPEC §14.5, phase S2b) ─────────────────────────

export const MESSAGE_SECRET_ABSENT = 'Le secret des portes n’est pas posé dans cet environnement.';
export const MESSAGE_SITE_ABSENT = 'L’adresse du site n’est pas configurée.';

/**
 * Le lien de questionnaire d'une séance : `<ORIGINE_SITE>/#r=<jeton>`, jeton
 * d'usage `questionnaire`, objet la séance, version son `liens_version`,
 * échéance son début. **Le lien n'est rangé nulle part** et n'est jamais
 * journalisé : il se recalcule quand on en a besoin (§14.5). Une instruction.
 *
 * C'est un `POST`, pas un `GET` : il fabrique un droit, et l'origine de
 * l'environnement est exigée comme pour une écriture.
 */
seances.post('/:id/lien-questionnaire', async (c) => {
  const db = baseClients(c.env);
  if (!secretDesPortes(c.env)) throw new Refus(MESSAGE_SECRET_ABSENT, 409);
  const origine = c.env.ORIGINE_SITE?.trim();
  if (!origine) throw new Refus(MESSAGE_SITE_ABSENT, 409);
  const id = c.req.param('id');
  const seance = await seancePourUnLien(db, id);
  if (!seance) throw new Refus(SEANCE_INTROUVABLE, 404);
  const jeton = await signerJeton(c.env, { usage: 'questionnaire', objet: id, echeance: seance.debut, version: seance.liens_version });
  return c.json({ lien: `${origine}/#r=${jeton}` });
});

/** Révoquer les liens d'une séance : le geste qu'aura l'écran de séance (C2). Une instruction. */
seances.post('/:id/revoquer-liens', async (c) => {
  const db = baseClients(c.env);
  if (!(await revoquerLesLiens(db, c.req.param('id'), Date.now()))) throw new Refus(SEANCE_INTROUVABLE, 404);
  return c.json({ revoques: true });
});
