/**
 * Le lien d'un questionnaire vaut-il ? (SPEC §14.5, §14.6.1, point 1.)
 *
 * **Un prédicat, deux appelants.** La vérification à l'ouverture de la page
 * (`verifierLienQuestionnaire`) et le rattachement d'un envoi
 * (`insertionQuestionnaire`) disent « valable » exactement aux mêmes liens :
 * sans quoi la page annoncerait valable un lien que l'envoi traiterait « à
 * rapprocher ». Les deux moitiés du prédicat vivent ici, et nulle part
 * ailleurs :
 *
 *   - le jeton (`jetonDeQuestionnaire`) : usage `questionnaire`, signature
 *     juste, non échu — vérifié sans la base ;
 *   - la séance (`seanceAuLienValable`) : elle existe, elle n'est pas annulée,
 *     et elle est à la version des liens que le jeton porte — vérifié dans la
 *     base, au moment même de l'instruction.
 *
 * Qu'elle ait déjà son questionnaire ne compte pas ici : le lien reste valable,
 * et c'est le rattachement qui décide de mettre un second envoi à part.
 */
import type { Env } from '../../env';
import { verifierJeton, type ContenuJeton } from '../jetons';

/**
 * Un jeton bien formé qui ne vaut jamais rien : vérifié quand l'envoi n'a pas
 * de référence, pour que le chemin sans lien fasse le même calcul que les
 * autres (règle 4).
 */
export const JETON_TEMOIN = `e30.${'A'.repeat(43)}`;

/**
 * Un identifiant de séance qui n'existe jamais : la lecture se fait aussi quand
 * le jeton est faux, sur lui (règle 4 : même chemin, mêmes instructions).
 */
export const SEANCE_TEMOIN = '~aucune-seance~';

/** Le contenu du jeton d'un questionnaire, ou `null` — la même chose quelle qu'en soit la raison. */
export const jetonDeQuestionnaire = (env: Pick<Env, 'PORTES_SECRET'>, reference: string | undefined, maintenant: number): Promise<ContenuJeton | null> =>
  verifierJeton(env, reference ?? JETON_TEMOIN, 'questionnaire', maintenant);

/**
 * La condition SQL « la séance `alias` est celle que ce lien ouvre » : deux
 * paramètres, l'identifiant et la version. Un fragment, pas une instruction :
 * le rattachement l'emploie dans son propre lot.
 */
export const seanceAuLienValable = (alias: string, id: string, version: string): string =>
  `${alias}.id = ${id} AND ${alias}.statut <> 'annulee' AND ${alias}.liens_version = ${version}`;
