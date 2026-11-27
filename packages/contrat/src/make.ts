/**
 * Gestion et Make (contrat §4) : les ordres que gestion remet, et les
 * confirmations que Make rend.
 */
import { z } from 'zod';
import { email } from './briques.ts';

/** Les sortes d'ordres, liste du contrat §4.1. La table `ordres` porte la même en CHECK. */
export const SORTES_ORDRE = [
  'message.email',
  'message.sms',
  'conversion.importer',
  'conversion.retirer',
  'contact.brevo',
  'client.comptabilite',
  'paiement.stancer.creer',
  'paiement.stancer.verifier',
  'facture.qonto.creer',
  'notification.florent',
] as const;
export type SorteOrdre = (typeof SORTES_ORDRE)[number];

/** Un code court, jamais un texte libre : il se range et se journalise sans risque. */
export const code = z.string().regex(/^[a-z0-9_.-]{1,64}$/);

/**
 * Une confirmation de Make (contrat §4.2). `motif` est obligatoire pour un
 * échec : sans lui, Florent verrait un échec sans savoir quoi regarder.
 */
export const confirmation = z
  .strictObject({
    ordre: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    issue: z.enum(['fait', 'echec']),
    resultat: z.strictObject({ identifiant_externe: z.string().max(200).optional() }).optional(),
    motif: code.optional(),
  })
  .superRefine((c, ctx) => {
    if (c.issue === 'echec' && c.motif === undefined) {
      ctx.addIssue({ code: 'custom', path: ['motif'], message: 'motif_requis' });
    }
  });
export type Confirmation = z.infer<typeof confirmation>;

/** Ce que Make reçoit pour un ordre `message.email` (contrat §4.1). */
export const messageEmail = z.strictObject({
  ordre: z.string().min(1).max(64),
  type: z.literal('message.email'),
  destinataire: z.strictObject({ nom: z.string().max(170), email }),
  objet: z.string().min(1).max(300),
  html: z.string().max(100_000),
  texte: z.string().max(100_000),
  pieces: z
    .array(z.strictObject({ nom: z.string().min(1).max(120), type: z.string().min(1).max(120), contenu: z.string().max(500_000) }))
    .max(5),
});
export type MessageEmail = z.infer<typeof messageEmail>;
