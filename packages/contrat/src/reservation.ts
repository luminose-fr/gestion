/**
 * Réserver (contrat §3.1) : lire les créneaux libres d'un type, puis réserver.
 *
 * Phase R1 (SPEC §14.12) : la lecture des types (`GET /v1/reservation/types`)
 * et le créneau libéré viendront plus tard — les pages du site connaissent
 * leur type.
 */
import { z } from 'zod';
import { cle, identite, dateAvecDecalage, dateSansHeure, reference } from './briques.ts';
import { refus } from './reponses.ts';

/** La clé d'un type de séance (`seance`, `rencontre`…), telle que la table `types_seance` la porte. */
export const cleType = z.string().regex(/^[a-z0-9_-]{1,40}$/);

/** `GET /v1/reservation/creneaux?type=…&du=…&au=…` — les paramètres de l'adresse, lus en objet. */
export const lectureCreneaux = z.strictObject({ type: cleType, du: dateSansHeure, au: dateSansHeure });
export type LectureCreneaux = z.infer<typeof lectureCreneaux>;

/** Au plus 62 jours par lecture (contrat §2), bornes comprises. */
export const JOURS_MAX_PAR_LECTURE = 62;

/** La réponse : les débuts libres, avec leur décalage. Rien d'autre — ni nom, ni motif. */
export const reponseCreneaux = z.union([
  z.strictObject({ ok: z.literal(true), creneaux: z.array(dateAvecDecalage).max(2000) }),
  refus,
]);

/** Une réponse à une question posée à la réservation. */
export const reponseReservation = z.strictObject({
  rang: z.number().int().min(1).max(50),
  question: z.string().min(1).max(500),
  reponse: z.string().max(2000),
});

/** `POST /v1/reservation` (contrat §3.1). */
export const reservation = z.strictObject({
  cle,
  type: cleType,
  debut: dateAvecDecalage,
  identite,
  mode: z.enum(['sur_place', 'visio', 'appel']).nullable().optional(),
  reponses: z.array(reponseReservation).max(50).optional(),
  conditions: z.strictObject({ acceptees: z.literal(true), version: z.number().int().min(1).max(10_000) }).optional(),
  liste_attente: z.boolean().optional(),
  provenance: z.strictObject({
    clic: z.strictObject({ type: z.string().max(20), id: z.string().max(200), date: dateSansHeure }).optional(),
    utm: z.record(z.string().max(30), z.string().max(200)).optional(),
  }).optional(),
  site_web: z.string().max(200).optional(),
});
export type Reservation = z.infer<typeof reservation>;

/**
 * La réussite : la référence — le jeton qui rattache un questionnaire à cette
 * séance —, le début et la fin. Re-sérialisée par la porte depuis ce schéma.
 */
export const reponseReserver = z.union([
  z.strictObject({ ok: z.literal(true), reference, debut: dateAvecDecalage, fin: dateAvecDecalage }),
  refus,
]);
