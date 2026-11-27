/**
 * Les fiches, vues de la console (SPEC §14.5, §15.3) — `/api/clients`.
 *
 * Sans liaison `CLIENTS`, 409 et le message du refus dans `error`, rien dans
 * les journaux (règle 2). Fermée au serveur MCP (§14.5). Une recherche de
 * personne part dans le corps d'un `POST` : aucune route de cette famille ne
 * lit un nom, une adresse ou un téléphone dans son adresse (§15.2, règle 3).
 */
import { z } from 'zod';
import { baseClients } from '../clients/base';
import type { EtatBaseClients } from '../clients/db';
import { newId } from '../db';
import { Refus } from '../refus';
import {
  rechercherFiches, fichesSemblables, creerFiche, modifierFiche, lireFiche, ficheExiste, type ChampsFiche,
} from '../clients/fiches';
import { lireNoteFiche, ecrireNoteFiche, lireConfiance, ecrireConfiance } from '../clients/sensible';
import { famille, corps, dateSimple, identifiant, texte, iso, emailFacultatif } from './clients-commun';

export const clients = famille();

export const MESSAGE_NOTE_MODIFIEE = "Cette note a été modifiée ailleurs. Rechargez-la avant d'enregistrer.";
const FICHE_INTROUVABLE = 'Cette fiche n’existe pas.';

/** Les trois effectifs en UNE instruction : trois sous-comptages, un aller-retour. */
clients.get('/etat', async (c) => {
  const ligne = await baseClients(c.env).prepare(`
    SELECT
      (SELECT COUNT(*) FROM clients) AS fiches,
      (SELECT COUNT(*) FROM seances) AS seances,
      (SELECT COUNT(*) FROM evenements WHERE deleted_at IS NULL) AS evenements`).first<EtatBaseClients>();
  const etat: EtatBaseClients = {
    fiches: Number(ligne?.fiches ?? 0),
    seances: Number(ligne?.seances ?? 0),
    evenements: Number(ligne?.evenements ?? 0),
  };
  return c.json(etat);
});

// ─── La liste et les fiches semblables ──────────────────────────────────────

const Recherche = z.strictObject({ q: z.string().max(200).default(''), page: z.number().int().min(0).max(10_000).default(0) });

clients.post('/recherche', async (c) => {
  const { q, page } = await corps(c, Recherche);
  const { fiches, suite } = await rechercherFiches(baseClients(c.env), q, page, Date.now());
  return c.json({
    fiches: fiches.map((f) => ({ ...f, derniereSeance: iso(f.derniereSeance), prochaineSeance: iso(f.prochaineSeance) })),
    page, suite,
  });
});

const Semblables = z.strictObject({
  prenom: z.string().max(80).default(''), nom: z.string().max(80).default(''), email: z.string().max(254).default(''),
});

clients.post('/semblables', async (c) => {
  const { prenom, nom, email } = await corps(c, Semblables);
  return c.json({ fiches: await fichesSemblables(baseClients(c.env), prenom, nom, email) });
});

// ─── Créer, lire, modifier une fiche ────────────────────────────────────────

/**
 * La liste fermée du §15.3. Jamais : la clé, le nom de recherche, le clic
 * d'annonce et sa date, les identifiants Stancer et Qonto, les traces d'envoi
 * vers Brevo et la comptabilité — un objet strict les refuse comme champs
 * inconnus, sans les nommer.
 */
const CHAMPS_FICHE = {
  civilite: texte(10).optional(),
  prenom: z.string().trim().min(1).max(80).optional(),
  nom: texte(80).optional(),
  email: emailFacultatif.optional(),
  telephone: texte(30).optional(),
  dateNaissance: dateSimple.nullable().optional(),
  profession: texte(120).optional(),
  adresse: texte(200).optional(),
  codePostal: texte(12).optional(),
  ville: texte(80).optional(),
  pays: texte(2).optional(),
  origine: texte(80).optional(),
  motCleGoogleAds: texte(120).optional(),
  viaProfessionnelId: identifiant.nullable().optional(),
  viaClientId: identifiant.nullable().optional(),
  coupleClientId: identifiant.nullable().optional(),
};
const ModificationFiche = z.strictObject(CHAMPS_FICHE);
const CreationFiche = z.strictObject({ ...CHAMPS_FICHE, prenom: z.string().trim().min(1).max(80) });

const refuserSoiMeme = (id: string, champs: ChampsFiche) => {
  if (champs.viaClientId === id || champs.coupleClientId === id) throw new Refus('Une fiche ne peut pas se désigner elle-même.', 400);
};

clients.post('/', async (c) => {
  const champs = await corps(c, CreationFiche);
  const id = newId();
  refuserSoiMeme(id, champs);
  await creerFiche(baseClients(c.env), id, champs, Date.now());
  return c.json({ id }, 201);
});

/** L'âge, en années révolues, calculé et jamais rangé (modèle §4). */
const age = (dateNaissance: string | null, maintenant: number): number | null => {
  if (!dateNaissance) return null;
  const [a, m, j] = dateNaissance.split('-').map(Number);
  const auj = new Date(maintenant);
  let ans = auj.getUTCFullYear() - a;
  if (auj.getUTCMonth() + 1 < m || (auj.getUTCMonth() + 1 === m && auj.getUTCDate() < j)) ans -= 1;
  return ans;
};

clients.get('/:id', async (c) => {
  const lue = await lireFiche(baseClients(c.env), c.req.param('id'));
  if (!lue) throw new Refus(FICHE_INTROUVABLE, 404);
  const f = lue.fiche;
  return c.json({
    id: f.id, civilite: f.civilite, prenom: f.prenom, nom: f.nom, email: f.email, telephone: f.telephone,
    dateNaissance: f.date_naissance, age: age(f.date_naissance as string | null, Date.now()),
    profession: f.profession, adresse: f.adresse, codePostal: f.code_postal, ville: f.ville, pays: f.pays,
    origine: f.origine, motCleGoogleAds: f.mot_cle_google_ads,
    viaProfessionnel: lue.viaProfessionnel, viaClient: lue.viaClient, couple: lue.couple, aRecommande: lue.aRecommande,
    creeeLe: iso(f.created_at as number), modifieeLe: iso(f.updated_at as number),
    seances: lue.seances.map((s) => ({
      id: s.id, numero: s.numero === null ? null : Number(s.numero), debut: iso(s.debut as number), dureeMin: s.duree_min,
      type: s.type_id ? { id: s.type_id, cle: s.type_cle, libelle: s.type_libelle } : null,
      libelleImporte: s.libelle_importe, statut: s.statut, etatPaiement: s.etat_paiement,
      montantCentimes: s.montant_centimes, mode: s.mode,
    })),
    inscriptions: lue.inscriptions.map((i) => ({
      id: i.id, statut: i.statut, modePaiement: i.mode_paiement, retenueJusqua: iso(i.retenue_jusqua as number | null),
      montantCentimes: i.montant_centimes,
      evenement: { id: i.evenement_id, nom: i.evenement_nom, debut: iso(i.evenement_debut as number) },
    })),
    // Le pluriel du mot est réservé à sensible.ts (§14.2, règle 3) : d'où ce nom composé.
    listeQuestionnaires: lue.listeQuestionnaires.map((q) => ({ id: q.id, date: iso(q.date), version: q.version, relu: q.relu, aRevoir: q.aRevoir })),
  });
});

clients.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const champs = await corps(c, ModificationFiche);
  refuserSoiMeme(id, champs);
  if (!(await modifierFiche(baseClients(c.env), id, champs, Date.now()))) throw new Refus(FICHE_INTROUVABLE, 404);
  return c.json({ id });
});

// ─── La note et la personne de confiance (règles 4 et 7) ────────────────────

clients.get('/:id/notes', async (c) => {
  const db = baseClients(c.env);
  const id = c.req.param('id');
  if (!(await ficheExiste(db, id))) throw new Refus(FICHE_INTROUVABLE, 404);
  return c.json(await lireNoteFiche(db, id));
});

const EcritureNote = z.strictObject({ texte: z.string().max(100_000), version: z.number().int().nonnegative().nullable() });

clients.put('/:id/notes', async (c) => {
  const db = baseClients(c.env);
  const id = c.req.param('id');
  const { texte: contenu, version } = await corps(c, EcritureNote);
  const issue = await ecrireNoteFiche(db, id, contenu, version, Date.now(), newId());
  if (issue.ecrite) return c.json({ version: issue.version });
  if (!(await ficheExiste(db, id))) throw new Refus(FICHE_INTROUVABLE, 404);
  throw new Refus(MESSAGE_NOTE_MODIFIEE, 409);
});

clients.get('/:id/confiance', async (c) => {
  const db = baseClients(c.env);
  const id = c.req.param('id');
  if (!(await ficheExiste(db, id))) throw new Refus(FICHE_INTROUVABLE, 404);
  const confiance = await lireConfiance(db, id);
  return c.json({ confiance: confiance && { ...confiance, misAJourLe: iso(confiance.misAJourLe) } });
});

const EcritureConfiance = z.strictObject({
  civilite: texte(10).default(null), prenom: texte(80).default(null), nom: texte(80).default(null),
  telephone: texte(30).default(null),
  email: emailFacultatif.default(null),
});

clients.put('/:id/confiance', async (c) => {
  const id = c.req.param('id');
  const confiance = await corps(c, EcritureConfiance);
  if (!(await ecrireConfiance(baseClients(c.env), id, confiance, Date.now(), newId()))) throw new Refus(FICHE_INTROUVABLE, 404);
  return c.json({ id });
});
