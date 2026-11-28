/**
 * Les réglages de la réservation (SPEC §15.3) — `/api/reservation`.
 *
 * Ils changent ce que la réservation en ligne proposera, rien de ce qui est
 * déjà posé : un rendez-vous existant garde son intervalle.
 */
import { z } from 'zod';
import { jourDeParis } from '@luminose/pratique';
import { baseClients } from '../clients/base';
import { Refus } from '../refus';
import {
  lireReservation, modifierType, ordonnerTypes, remplacerSemaine, poserDate, retirerDate, modifierReglages, REGLAGES_CONNUS,
  type CleReglage,
} from '../clients/reservation';
import { famille, corps, valider, dateSimple, heure } from './clients-commun';

export const reservation = famille();

type Brut = Record<string, unknown>;
const bool = (v: unknown) => Number(v) === 1;

reservation.get('/', async (c) => {
  const lu = await lireReservation(baseClients(c.env), jourDeParis(Date.now()));
  return c.json({
    types: lu.types.map((t: Brut) => ({
      id: t.id, cle: t.cle, libelle: t.libelle, nature: t.nature, dureeMin: t.duree_min, margeApresMin: t.marge_apres_min,
      pasMin: t.pas_min, lieu: t.lieu, montantCentimes: t.montant_centimes, etatPaiementDefaut: t.etat_paiement_defaut,
      questionnaireRequis: bool(t.questionnaire_requis), conditionsAnnulation: bool(t.conditions_annulation),
      listeAttenteProposee: bool(t.liste_attente_proposee), fenetreDebutH: t.fenetre_debut_h, fenetreFinH: t.fenetre_fin_h,
      reservableEnLigne: bool(t.reservable_en_ligne), actif: bool(t.actif), ordre: t.ordre,
    })),
    semaine: lu.semaine.map((h: Brut) => ({ id: h.id, jour: h.jour, debut: h.debut, fin: h.fin })),
    // Une date fermée est une ligne sans plage : elle se rend avec une liste vide.
    dates: Object.entries(lu.dates.reduce<Record<string, { debut: string; fin: string }[]>>((acc, d: Brut) => {
      const date = String(d.date);
      acc[date] ??= [];
      if (d.debut !== null) acc[date].push({ debut: String(d.debut), fin: String(d.fin) });
      return acc;
    }, {})).map(([date, plages]) => ({ date, plages })),
    reglages: Object.fromEntries(lu.reglages.map((r: Brut) => [r.cle, Number(r.valeur)])),
  });
});

const ModificationType = z.strictObject({
  libelle: z.string().trim().min(1).max(120).optional(),
  dureeMin: z.number().int().min(5).max(24 * 60).optional(),
  margeApresMin: z.number().int().min(0).max(24 * 60).optional(),
  pasMin: z.number().int().min(5).max(24 * 60).optional(),
  lieu: z.enum(['sur_place', 'visio', 'visio_ou_appel']).optional(),
  montantCentimes: z.number().int().min(0).max(10_000_000).optional(),
  fenetreDebutH: z.number().int().min(0).max(100_000).optional(),
  fenetreFinH: z.number().int().min(1).max(100_000).optional(),
  reservableEnLigne: z.boolean().optional(),
  actif: z.boolean().optional(),
  ordre: z.number().int().min(0).max(1000).optional(),
});

reservation.patch('/types/:id', async (c) => {
  const champs = await corps(c, ModificationType);
  // La base refuse aussi une fenêtre inversée (CHECK) ; on le dit avant, en clair.
  if (champs.fenetreDebutH !== undefined && champs.fenetreFinH !== undefined && champs.fenetreFinH <= champs.fenetreDebutH) {
    throw new Refus('La fenêtre doit se fermer après s’être ouverte.', 400);
  }
  if (!(await modifierType(baseClients(c.env), c.req.param('id'), champs, Date.now()))) throw new Refus('Ce type n’existe pas.', 404);
  return c.json({ id: c.req.param('id') });
});

// Avant `/types/:id` dans la lecture, sans conflit : la méthode diffère (PUT).
reservation.put('/types/ordre', async (c) => {
  const { ids } = await corps(c, z.strictObject({ ids: z.array(z.string().min(1).max(64)).min(1).max(40) }));
  await ordonnerTypes(baseClients(c.env), ids, Date.now());
  return c.json({ types: ids.length });
});

const plage = z.strictObject({ debut: heure, fin: heure });

/** Début avant fin, et deux plages d'un même jour ne se chevauchent pas. */
const sansChevauchement = (plages: { debut: string; fin: string }[]): boolean => {
  const triees = [...plages].sort((a, b) => a.debut.localeCompare(b.debut));
  return triees.every((p, i) => p.debut < p.fin && (i === 0 || triees[i - 1].fin <= p.debut));
};

const Semaine = z.strictObject({ plages: z.array(z.strictObject({ jour: z.number().int().min(1).max(7), debut: heure, fin: heure })).max(70) });

reservation.put('/semaine', async (c) => {
  const { plages } = await corps(c, Semaine);
  for (let jour = 1; jour <= 7; jour++) {
    if (!sansChevauchement(plages.filter((p) => p.jour === jour))) {
      throw new Refus('Les plages d’un jour doivent commencer avant de finir, et ne pas se chevaucher.', 400);
    }
  }
  await remplacerSemaine(baseClients(c.env), plages, Date.now());
  return c.json({ plages: plages.length });
});

const dateDeLAdresse = (c: { req: { param: (n: string) => string } }) => valider(z.strictObject({ date: dateSimple }), { date: c.req.param('date') }).date;

reservation.put('/dates/:date', async (c) => {
  const date = dateDeLAdresse(c);
  const { plages } = await corps(c, z.strictObject({ plages: z.array(plage).max(10) }));
  if (!sansChevauchement(plages)) throw new Refus('Les plages doivent commencer avant de finir, et ne pas se chevaucher.', 400);
  await poserDate(baseClients(c.env), date, plages, Date.now());
  return c.json({ date, fermee: plages.length === 0 });
});

reservation.delete('/dates/:date', async (c) => {
  const date = dateDeLAdresse(c);
  if (!(await retirerDate(baseClients(c.env), date, Date.now()))) throw new Refus('Cette date suit déjà la semaine type.', 404);
  return c.json({ date });
});

const Reglages = z.strictObject(Object.fromEntries(REGLAGES_CONNUS.map((cle) => [cle, z.number().int().min(0).max(100_000).optional()])) as Record<CleReglage, z.ZodOptional<z.ZodNumber>>);

reservation.patch('/reglages', async (c) => {
  const valeurs = await corps(c, Reglages);
  await modifierReglages(baseClients(c.env), valeurs, Date.now());
  return c.json({ reglages: Object.keys(valeurs).length });
});
