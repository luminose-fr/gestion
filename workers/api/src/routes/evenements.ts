/**
 * Les évènements et leurs inscriptions, vus de la console (SPEC §15.3) —
 * `/api/evenements` et `/api/inscriptions`.
 *
 * Une place ne se prend, et ne se reprend, que par sa décision (§15.2,
 * règle 12) : la dernière place, comptée à l'instant de l'écriture. Les places
 * d'un évènement ne descendent pas sous l'occupation, et un évènement qui a
 * des inscrits ne se supprime pas — chaque fois, la condition est dans
 * l'écriture. La publication sur le site n'est pas d'ici : `publie` ne se
 * modifie pas.
 */
import { z } from 'zod';
import { baseClients } from '../clients/base';
import { newId } from '../db';
import { Refus } from '../refus';
import { prendrePlace, confirmerInscription, supprimerEvenement } from '../clients/decisions';
import {
  listeEvenements, lireEvenement, creerEvenement, modifierEvenement, etatEvenement, inscriptionExiste,
  changerStatutInscription, encaisserInscription,
} from '../clients/evenements';
import { famille, corps, estUnicite, identifiant, instantIso, texte, iso } from './clients-commun';

export const evenements = famille();
export const inscriptions = famille();

export const MESSAGE_COMPLET = 'Cette journée est complète.';
export const MESSAGE_DEJA_INSCRITE = 'Cette personne est déjà inscrite à cette journée.';
export const MESSAGE_INSCRITS = 'Un évènement qui a des inscrits ne se supprime pas.';
const EVENEMENT_INTROUVABLE = 'Cet évènement n’existe pas.';
/** Ce que l'index des inscriptions vivantes écrit quand il refuse un doublon. */
const DOUBLON = /inscriptions\.evenement_id/;

type Brut = Record<string, unknown>;

const enSortie = (e: Brut) => {
  const totales = e.places_totales === null ? null : Number(e.places_totales);
  const occupees = Number(e.places_occupees);
  return {
    id: e.id, nom: e.nom, type: e.type, debut: iso(e.debut as number), fin: iso(e.fin as number | null), ville: e.ville,
    placesTotales: totales, placesOccupees: occupees, placesLibres: totales === null ? null : Math.max(totales - occupees, 0),
    prixCentimes: e.prix_centimes, questionnaireRequis: Number(e.questionnaire_requis) === 1,
    urlInscription: e.url_inscription, publie: Number(e.publie) === 1,
  };
};

evenements.get('/', async (c) => c.json({ evenements: (await listeEvenements(baseClients(c.env), Date.now())).map(enSortie) }));

evenements.get('/:id', async (c) => {
  const lu = await lireEvenement(baseClients(c.env), c.req.param('id'), Date.now());
  if (!lu) throw new Refus(EVENEMENT_INTROUVABLE, 404);
  const e = lu.evenement;
  return c.json({
    ...enSortie(e),
    metaDescription: e.meta_description, htmlPermalink: e.html_permalink, htmlProgramme: e.html_programme,
    htmlPrix: e.html_prix, htmlLieuAdresse: e.html_lieu_adresse, htmlLieuInstructions: e.html_lieu_instructions,
    jours: lireJours(e.jours),
    inscriptions: lu.inscriptions.map((i) => ({
      id: i.id, statut: i.statut, modePaiement: i.mode_paiement, retenueJusqua: iso(i.retenue_jusqua as number | null),
      montantCentimes: i.montant_centimes, origine: i.origine, le: iso(i.created_at as number),
      paiement: i.paye_par ? { moyen: i.paye_par, le: iso(i.paye_le as number) } : null,
      questionnaire: i.questionnaire_id ? { id: i.questionnaire_id, etat: i.questionnaire_etat } : null,
      personne: { clientId: i.client_id ?? null, prenom: i.personne_prenom ?? null, nom: i.personne_nom ?? null },
    })),
  });
});

/** Les jours d'un stage (0005), en ISO ; une colonne illisible se lit comme absente. */
const lireJours = (brut: unknown): { debut: string; fin: string }[] | null => {
  if (typeof brut !== 'string' || !brut) return null;
  try {
    const jours = JSON.parse(brut) as { debut: number; fin: number }[];
    return Array.isArray(jours) ? jours.map((j) => ({ debut: iso(j.debut) as string, fin: iso(j.fin) as string })) : null;
  } catch { return null; }
};

const Jour = z.strictObject({ debut: instantIso, fin: instantIso });

/** Les contenus HTML voyagent tels quels : ils ne sont pas interprétés ici. */
const html = z.string().max(100_000).nullable();
const CHAMPS = {
  nom: z.string().trim().min(1).max(200).optional(),
  type: texte(60).optional(),
  debut: instantIso.optional(),
  fin: instantIso.nullable().optional(),
  ville: texte(80).optional(),
  placesTotales: z.number().int().min(0).max(10_000).nullable().optional(),
  prixCentimes: z.number().int().min(0).max(10_000_000).nullable().optional(),
  questionnaireRequis: z.boolean().optional(),
  urlInscription: z.url().max(500).nullable().optional(),
  metaDescription: texte(500).optional(),
  htmlPermalink: html.optional(),
  htmlProgramme: html.optional(),
  htmlPrix: html.optional(),
  htmlLieuAdresse: html.optional(),
  htmlLieuInstructions: html.optional(),
  /** Plusieurs jours, chacun avec ses heures : `debut` et `fin` les suivent (premier début, dernière fin). */
  jours: z.array(Jour).min(1).max(14).nullable().optional(),
};
const Modification = z.strictObject(CHAMPS);

/**
 * Les jours reçus deviennent la colonne `jours`, et `debut`–`fin` les suivent :
 * le début du premier, la fin du dernier — ce que lisent les listes et les places.
 */
const avecJours = <T extends { jours?: { debut: number; fin: number }[] | null }>(champs: T) => {
  const { jours, ...reste } = champs;
  if (jours === undefined) return reste;
  if (jours === null) return { ...reste, jours: null };
  const tries = [...jours].sort((a, b) => a.debut - b.debut);
  if (tries.some((j) => j.fin <= j.debut)) throw new Refus('Chaque jour doit finir après avoir commencé.', 400);
  return { ...reste, debut: tries[0].debut, fin: tries[tries.length - 1].fin, jours: tries.length > 1 ? JSON.stringify(tries) : null };
};
const Creation = z.strictObject({ ...CHAMPS, nom: z.string().trim().min(1).max(200), debut: instantIso });

evenements.post('/', async (c) => {
  const champs = avecJours(await corps(c, Creation));
  const id = newId();
  await creerEvenement(baseClients(c.env), id, champs as typeof champs & { nom: string; debut: number }, Date.now());
  return c.json({ id }, 201);
});

evenements.patch('/:id', async (c) => {
  const db = baseClients(c.env);
  const id = c.req.param('id');
  const champs = avecJours(await corps(c, Modification));
  if (await modifierEvenement(db, id, champs, Date.now())) return c.json({ id });
  const etat = await etatEvenement(db, id);
  if (!etat || etat.deleted_at !== null) throw new Refus(EVENEMENT_INTROUVABLE, 404);
  throw new Refus('Il y a plus de places occupées que ce nombre de places.', 409);
});

evenements.delete('/:id', async (c) => {
  const db = baseClients(c.env);
  const id = c.req.param('id');
  if (await supprimerEvenement(db, id, Date.now())) return c.json({ id });
  const etat = await etatEvenement(db, id);
  if (!etat || etat.deleted_at !== null) throw new Refus(EVENEMENT_INTROUVABLE, 404);
  throw new Refus(MESSAGE_INSCRITS, 409);
});

/** 32 caractères tirés au hasard : la référence d'une inscription ne signifie rien. */
const reference = () => crypto.randomUUID().replace(/-/g, '');

evenements.post('/:id/inscriptions', async (c) => {
  const db = baseClients(c.env);
  const evenementId = c.req.param('id');
  const { clientId } = await corps(c, z.strictObject({ clientId: identifiant }));
  const id = newId();
  try {
    const issue = await prendrePlace(db, {
      id, evenementId, clientId, statut: 'confirmee', reference: reference(), origine: 'console',
    }, Date.now());
    if (issue.faite) return c.json({ id }, 201);
  } catch (err) {
    if (estUnicite(err, DOUBLON)) throw new Refus(MESSAGE_DEJA_INSCRITE, 409);
    throw err;
  }
  const etat = await etatEvenement(db, evenementId);
  if (!etat || etat.deleted_at !== null) throw new Refus(EVENEMENT_INTROUVABLE, 404);
  if (etat.places_totales === null) throw new Refus('Cette journée n’a pas de nombre de places : l’inscription se fait ailleurs.', 409);
  throw new Refus(MESSAGE_COMPLET, 409);
});

const Statut = z.strictObject({ statut: z.enum(['annulee', 'deconseillee', 'confirmee']) });

inscriptions.patch('/:id', async (c) => {
  const db = baseClients(c.env);
  const id = c.req.param('id');
  const { statut } = await corps(c, Statut);
  const maintenant = Date.now();
  if (statut !== 'confirmee') {
    if (!(await changerStatutInscription(db, id, statut, maintenant))) throw new Refus('Cette inscription n’existe pas.', 404);
    return c.json({ id });
  }
  try {
    if ((await confirmerInscription(db, id, maintenant)).faite) return c.json({ id });
  } catch (err) {
    if (estUnicite(err, DOUBLON)) throw new Refus(MESSAGE_DEJA_INSCRITE, 409);
    throw err;
  }
  if (!(await inscriptionExiste(db, id))) throw new Refus('Cette inscription n’existe pas.', 404);
  throw new Refus(MESSAGE_COMPLET, 409);
});

/** Encaisser à la main un stage payé en espèces ou par virement (refonte, lot 8). */
inscriptions.post('/:id/paiement', async (c) => {
  const db = baseClients(c.env);
  const { moyen } = await corps(c, z.strictObject({ moyen: z.enum(['especes', 'virement']) }));
  if (await encaisserInscription(db, c.req.param('id'), moyen, Date.now())) return c.json({ id: c.req.param('id') });
  if (!(await inscriptionExiste(db, c.req.param('id')))) throw new Refus('Cette inscription n’existe pas.', 404);
  throw new Refus('Rien à encaisser : l’inscription est déjà payée, ou elle est annulée.', 409);
});
