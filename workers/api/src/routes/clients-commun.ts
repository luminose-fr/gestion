/**
 * Ce que les routes de la base des clients ont en commun (SPEC §15.2, §15.3).
 *
 * Trois choses, qu'aucune route ne doit refaire à sa façon :
 *
 * - **La validation** ne rend que des noms de champs CONNUS du schéma. Le
 *   gestionnaire général d'`index.ts` rend le détail de zod tel quel, ce qui
 *   convient à l'éditorial ; ici, un champ inconnu est un nom que l'appelant a
 *   écrit comme il voulait — il peut porter une adresse, un nom — et il ne se
 *   recopie pas (§14.2, règle 7). Il se dit `champ_inconnu`.
 * - **Une panne** ne journalise qu'un code d'incident fixe. L'exception d'une
 *   requête SQL peut citer une valeur liée ; le message d'un `throw` peut
 *   citer ce qu'il voulait vérifier. Rien de cela ne part dans les journaux.
 * - **Les erreurs de contrainte** que l'appelant peut corriger — un lien vers
 *   une fiche qui n'existe pas, une valeur hors des bornes du schéma — sont des
 *   refus, pas des pannes.
 *
 * `Cache-Control: no-store` est posé par `index.ts` sur TOUTE réponse, y compris
 * celles de `onError` : une seule pose, que les tests vérifient famille par famille.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import type { Contexte } from '../env';
import { Refus } from '../refus';
import { instantDepuisIso, isoDeParis, normaliserEmail } from '@luminose/pratique';

/** Le code journalisé pour toute panne de ces familles : il dit où chercher, rien de plus. */
export const CODE_INCIDENT = 'CLIENTS-PANNE';

/** Une erreur de validation : le statut 400, et les champs en défaut, par leur nom de schéma. */
export class Invalide extends Error {
  constructor(readonly champs: string[]) {
    super('Entrée invalide');
    this.name = 'Invalide';
  }
}

/**
 * Les noms des champs en défaut — seulement ceux que le schéma connaît. Une
 * clé inconnue n'est jamais nommée : `champ_inconnu`, une fois.
 */
export const champsEnDefaut = (erreur: z.ZodError, connus: readonly string[]): string[] => {
  const champs = new Set<string>();
  for (const issue of erreur.issues) {
    const tete = issue.path[0];
    if (issue.code === 'unrecognized_keys') champs.add('champ_inconnu');
    else if (typeof tete === 'string' && connus.includes(tete)) champs.add(issue.path.filter((p) => typeof p !== 'symbol').join('.'));
    else if (issue.path.length === 0) champs.add('corps');
    else champs.add('champ_inconnu');
  }
  return [...champs];
};

const clesDe = (schema: z.ZodType): string[] =>
  schema instanceof z.ZodObject ? Object.keys(schema.shape) : [];

/** Valide, ou lève `Invalide`. Le corps illisible est `corps`. */
export const valider = <S extends z.ZodType>(schema: S, donnees: unknown): z.infer<S> => {
  const r = schema.safeParse(donnees);
  if (!r.success) throw new Invalide(champsEnDefaut(r.error, clesDe(schema)));
  return r.data;
};

/** Le corps JSON d'une requête, validé. Un corps qui n'est pas du JSON : `corps`. */
export const corps = async <S extends z.ZodType>(c: Context<Contexte>, schema: S): Promise<z.infer<S>> => {
  let donnees: unknown;
  try {
    donnees = await c.req.json();
  } catch {
    throw new Invalide(['corps']);
  }
  return valider(schema, donnees);
};

/** Ce que SQLite et D1 écrivent quand une contrainte refuse une écriture. */
const CONTRAINTE = /(FOREIGN KEY|CHECK|UNIQUE) constraint failed/i;

/** Une famille de routes des clients : son propre gestionnaire d'erreurs. */
export const famille = () => {
  const app = new Hono<Contexte>();
  app.onError((err, c) => {
    if (err instanceof Invalide) return c.json({ error: 'Entrée invalide', champs: err.champs }, 400);
    if (err instanceof Refus) return c.json({ error: err.message }, err.status);
    const message = err instanceof Error ? err.message : '';
    // Un lien vers une ligne absente, une valeur hors bornes : l'appelant peut corriger.
    // Le message de la base n'est pas recopié — il peut nommer des colonnes, et c'est tout.
    if (/FOREIGN KEY constraint failed/i.test(message)) {
      return c.json({ error: 'Une fiche, un type ou un professionnel désigné n’existe pas.' }, 400);
    }
    if (/CHECK constraint failed/i.test(message)) {
      return c.json({ error: 'Une valeur sort des bornes permises.' }, 400);
    }
    if (CONTRAINTE.test(message)) return c.json({ error: 'Cette écriture en contredit une autre.' }, 409);
    console.error('Incident', CODE_INCIDENT);
    return c.json({ error: 'Erreur interne' }, 500);
  });
  return app;
};

/** Une erreur d'unicité de la base, reconnue à son message — sans le recopier. */
export const estUnicite = (err: unknown, motif: RegExp): boolean =>
  err instanceof Error && /UNIQUE constraint failed/i.test(err.message) && motif.test(err.message);

// ─── Les briques des schémas ────────────────────────────────────────────────

/** Une date avec heure, avec son décalage (§14.7) → un instant. */
export const instantIso = z.string().max(40).transform((texte, ctx) => {
  const t = instantDepuisIso(texte);
  if (t === null) {
    ctx.addIssue({ code: 'custom', message: 'date avec décalage attendue' });
    return z.NEVER;
  }
  return t;
});

/** Une date sans heure, `AAAA-MM-JJ`, qui existe. */
export const dateSimple = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => {
  const t = Date.parse(`${d}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d;
});

/** Une heure d'horaire, `HH:MM`, heure de Paris. */
export const heure = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const identifiant = z.string().min(1).max(64);

/** Un texte facultatif : vide ou blanc, il s'efface (`null`). */
export const texte = (max: number) =>
  z.string().max(max).nullable().transform((v) => (v === null || v.trim() === '' ? null : v.trim()));

/** L'instant, ou rien, vers ce que le contrat veut voir : la date avec son décalage. */
export const iso = (instant: number | null | undefined): string | null =>
  instant === null || instant === undefined ? null : isoDeParis(Number(instant));

/**
 * Une adresse e-mail facultative : normalisée AVANT d'être vérifiée — une
 * adresse collée avec ses espaces ou ses majuscules est une adresse valable.
 * Vide : `null`.
 */
export const emailFacultatif = z.string().max(254).nullable()
  .transform((v) => (v === null ? null : normaliserEmail(v) || null))
  .refine((v) => v === null || z.email().safeParse(v).success);
