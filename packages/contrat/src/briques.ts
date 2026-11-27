/**
 * Les briques du contrat : ce que plusieurs envois partagent.
 *
 * Les longueurs maximales sont des choix de la phase S2a (le contrat dit qu'il
 * y en a, sans les chiffrer) : SPEC §14.6.1. Les objets sont STRICTS — un champ
 * inconnu est refusé, et son nom n'est jamais recopié dans le refus (valider.ts).
 */
import { z } from 'zod';

export const LONGUEURS = {
  prenom: 80,
  nom: 80,
  email: 254,
  telephone: 30,
  profession: 120,
  adresse: 200,
  code_postal: 12,
  ville: 80,
  reference: 512,
  evenement: 64,
  version_formulaire: 16,
  reponses: 80,
  reponse_cle: 80,
  reponse_libelle: 500,
  reponse: 2000,
  informations: 4000,
  site_web: 200,
} as const;

/** La clé d'un envoi, fabriquée par l'appelant (contrat §2). */
export const cle = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

/** Au moins un caractère qui ne soit pas un espace. */
const rempli = (max: number) => z.string().max(max).regex(/\S/);
const texte = (max: number) => z.string().max(max);
/** Facultatif : absent, `null`, ou un texte borné. */
const facultatif = (max: number) => texte(max).nullable().optional();

export const email = z.email().max(LONGUEURS.email);
export const telephone = z.string().max(LONGUEURS.telephone).regex(/^[0-9+ ().-]*$/);
export const civilite = z.enum(['Mme', 'M.']);

const dateValide = (texte: string) => {
  const [a, m, j] = texte.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
};

/** Une date sans heure : `1988-04-12`. */
export const dateSansHeure = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(dateValide);

/** Une date avec son décalage : `2026-12-17T09:30:00+01:00` (contrat §2). */
export const dateAvecDecalage = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/)
  .refine((t) => dateValide(t.slice(0, 10)) && !Number.isNaN(Date.parse(t)));

/** Qui envoie : prénom, nom et adresse obligatoires, téléphone facultatif. */
export const identite = z.strictObject({
  prenom: rempli(LONGUEURS.prenom),
  nom: texte(LONGUEURS.nom),
  email,
  telephone: telephone.nullable().optional(),
});

/** Les coordonnées d'un questionnaire complet : toutes facultatives. */
export const coordonnees = z.strictObject({
  civilite: civilite.nullable().optional(),
  date_naissance: dateSansHeure.nullable().optional(),
  profession: facultatif(LONGUEURS.profession),
  adresse: facultatif(LONGUEURS.adresse),
  code_postal: facultatif(LONGUEURS.code_postal),
  ville: facultatif(LONGUEURS.ville),
});

/** La personne de confiance : toutes facultatives. */
export const confiance = z.strictObject({
  civilite: civilite.nullable().optional(),
  prenom: facultatif(LONGUEURS.prenom),
  nom: facultatif(LONGUEURS.nom),
  telephone: telephone.nullable().optional(),
  email: email.nullable().optional(),
});

export type Identite = z.infer<typeof identite>;
export type Coordonnees = z.infer<typeof coordonnees>;
export type Confiance = z.infer<typeof confiance>;
