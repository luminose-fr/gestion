/**
 * Envoyer un questionnaire de santé (contrat §3.2).
 *
 * Le schéma dit ce qui est recevable ; il ne dit rien du rattachement — une
 * référence fausse ou échue est un texte bien formé, et le questionnaire est
 * enregistré quand même, « à rapprocher » (SPEC §14.6.1). Le champ piège
 * `site_web` est accepté par le schéma : c'est gestion qui refuse un envoi où
 * il est rempli, sans nommer de champ (`champPiegeRempli`).
 */
import { z } from 'zod';
import { LONGUEURS, cle, reference, identite, coordonnees, confiance } from './briques.ts';

export const CONTEXTES = ['seance', 'decouverte', 'groupe', 'journee_externe'] as const;
export const VERSIONS = ['complet', 'suivi'] as const;

export const reponseQuestion = z.strictObject({
  cle: z.string().regex(new RegExp(`^[a-z0-9._-]{1,${LONGUEURS.reponse_cle}}$`)),
  libelle: z.string().min(1).max(LONGUEURS.reponse_libelle),
  reponse: z.string().max(LONGUEURS.reponse),
});

export const questionnaire = z
  .strictObject({
    cle,
    contexte: z.enum(CONTEXTES),
    version: z.enum(VERSIONS),
    version_formulaire: z.string().regex(new RegExp(`^[A-Za-z0-9._-]{1,${LONGUEURS.version_formulaire}}$`)),
    // Le jeton du lien, tel que la page l'a lu après le `#` (contrat §2).
    reference: reference.optional(),
    // Une journée chez un organisateur : l'identifiant de l'évènement.
    evenement: z.string().regex(new RegExp(`^[A-Za-z0-9_-]{1,${LONGUEURS.evenement}}$`)).optional(),
    identite,
    coordonnees: coordonnees.optional(),
    confiance: confiance.optional(),
    reponses: z.array(reponseQuestion).max(LONGUEURS.reponses),
    informations: z.string().max(LONGUEURS.informations).optional(),
    declaration: z.literal(true),
    accord: z.strictObject({ accepte: z.literal(true), version: z.number().int().min(1).max(10_000) }),
    site_web: z.string().max(LONGUEURS.site_web).optional(),
  })
  .superRefine((q, ctx) => {
    // Jamais les deux : une référence désigne une séance, un évènement une journée.
    if (q.reference !== undefined && q.evenement !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['evenement'], message: 'reference_et_evenement' });
    }
  });

export type Questionnaire = z.infer<typeof questionnaire>;
export type ReponseQuestion = z.infer<typeof reponseQuestion>;

/**
 * Le champ piège est-il rempli ? Lu sur l'envoi BRUT, avant toute validation :
 * un envoi qui le remplit est refusé `invalide` sans champs, quoi qu'il porte
 * par ailleurs — une personne dont le navigateur l'aurait rempli doit voir une
 * erreur, pas croire son envoi parti (SPEC §14.6.1).
 */
export const champPiegeRempli = (envoi: unknown): boolean => {
  if (typeof envoi !== 'object' || envoi === null) return false;
  const valeur = (envoi as Record<string, unknown>).site_web;
  return valeur !== undefined && valeur !== null && valeur !== '';
};

/**
 * Vérifier le lien d'un questionnaire à l'ouverture de la page (SPEC §14.5,
 * §14.6.1, point 1 — décision du 27/11/2026). Une lecture, pas une commande :
 * pas de clé. La réponse ne dit rien de la séance : `{ ok: true }`, ou le refus
 * `lien_invalide`.
 */
export const lienQuestionnaire = z.strictObject({ reference });
export type LienQuestionnaire = z.infer<typeof lienQuestionnaire>;
