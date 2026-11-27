/**
 * Valider un envoi, et ne rendre que des NOMS (SPEC §14.2, règle 7).
 *
 * Un refus `invalide` porte la liste des champs en défaut. Elle ne doit rien
 * recopier de l'envoi : ni une valeur, ni le nom d'une clé que l'appelant a pu
 * inventer — un script peut écrire un nom, une adresse, n'importe quoi à la
 * place d'une clé. On ne garde donc d'un défaut que son chemin dans le
 * schéma, positions de liste retirées (`reponses.libelle`, pas `reponses.3`) ;
 * une clé inconnue se dit `champ_inconnu`, au niveau où elle a été trouvée,
 * sans jamais être nommée.
 */
import type { z } from 'zod';
import { invalide, type Refus } from './reponses.ts';

export type Validation<T> = { valide: true; donnees: T } | { valide: false; refus: Refus };

const nomDuChemin = (chemin: readonly PropertyKey[]): string[] =>
  chemin.filter((s): s is string => typeof s === 'string');

/** Les noms des champs en défaut, connus du schéma. */
export const champsEnDefaut = (erreur: z.ZodError): string[] =>
  erreur.issues.flatMap((issue) => {
    const chemin = nomDuChemin(issue.path);
    if (issue.code === 'unrecognized_keys') return [[...chemin, 'champ_inconnu'].join('.')];
    // Un envoi qui n'est pas un objet n'a pas de champ à nommer.
    return chemin.length > 0 ? [chemin.join('.')] : [];
  });

export const valider = <S extends z.ZodType>(schema: S, envoi: unknown): Validation<z.infer<S>> => {
  const r = schema.safeParse(envoi);
  return r.success ? { valide: true, donnees: r.data } : { valide: false, refus: invalide(champsEnDefaut(r.error)) };
};
