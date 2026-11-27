/**
 * Les réponses de la porte publique (contrat §2) : trois formes, et pas une
 * de plus — réussite, refus d'une liste fermée, panne. La panne n'a pas de
 * corps : c'est un statut 5xx, que la porte sert quand gestion lève.
 */
import { z } from 'zod';

/** Les motifs de refus, liste fermée (contrat §2). */
export const MOTIFS = [
  'creneau_pris',
  'hors_fenetre',
  'journee_complete',
  'code_invalide',
  'lien_invalide',
  'invalide',
  'trop_de_demandes',
  'ferme',
] as const;
export type Motif = (typeof MOTIFS)[number];

/** Une réussite : `{ ok: true }`, et ce que le parcours rend en plus (une référence, des dates…). */
export const reussite = z.object({ ok: z.literal(true) }).loose();
export type Reussite = { ok: true } & Record<string, unknown>;

/**
 * Un refus. `champs` n'accompagne que `invalide` : les NOMS des champs en
 * défaut, tels que le schéma les connaît — jamais ce qui a été reçu (règle 7).
 */
export const refus = z.strictObject({
  ok: z.literal(false),
  motif: z.enum(MOTIFS),
  champs: z.array(z.string().max(120)).max(200).optional(),
});
export type Refus = { ok: false; motif: Motif; champs?: string[] };

export const reponse = z.union([reussite, refus]);
export type Reponse = Reussite | Refus;

/**
 * Une réponse qui ne porte rien d'autre que son issue : celle d'un
 * questionnaire et d'une vérification de lien. La porte re-sérialise ce que
 * gestion rend depuis ce schéma ; un champ de plus est une panne, pas un corps
 * à relayer — règle 4 : à parcours égal, la même réponse.
 */
export const reponseSansDonnee = z.union([z.strictObject({ ok: z.literal(true) }), refus]);

export const OK: Reussite = { ok: true };

export const refuser = (motif: Exclude<Motif, 'invalide'>): Refus => ({ ok: false, motif });

/** `invalide`, avec les noms des champs en défaut — triés, sans doublon. */
export const invalide = (champs: string[] = []): Refus => ({
  ok: false,
  motif: 'invalide',
  champs: [...new Set(champs)].sort(),
});
