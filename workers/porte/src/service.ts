/**
 * La porte de service (SPEC §14.5) : `POST /service/v1/confirmations`, pour
 * Make.
 *
 * Ni CORS ni contrôle d'origine : Make appelle de serveur à serveur. Le type et
 * la taille comme pour la porte publique ; pas de schéma ici — l'autorisation
 * se vérifie AVANT, et c'est gestion qui la vérifie : la porte transmet
 * l'en-tête `Authorization` tel quel (§14.3 : une entrée ne vaut pas une
 * authentification). Un appelant sans jeton n'apprend donc rien de la forme
 * attendue.
 *
 * `{ autorisation: 'refusee' }` de gestion : 401, corps vide.
 */
import { invalide, reponse } from '@luminose/contrat';
import type { Env } from './env.ts';
import { typeJson, lireCorps, avecDelai } from './bornes.ts';
import { json, vide, panne, journaliser } from './reponses.ts';
import { DELAI_MS } from './publique.ts';

export const porterService = async (requete: Request, env: Env): Promise<Response> => {
  if (!typeJson(requete)) return vide(415);
  const lecture = await lireCorps(requete);
  if (lecture.etat === 'trop_gros') return vide(413);
  if (lecture.etat === 'illisible') return json(invalide());

  const gestion = env.GESTION_SERVICE;
  if (!gestion) { journaliser('porte.non_reliee'); return panne(); }
  let recu: unknown;
  try {
    recu = await avecDelai(gestion.confirmation(requete.headers.get('Authorization'), lecture.valeur), DELAI_MS);
  } catch (erreur) {
    journaliser(erreur instanceof Error && erreur.message === 'porte.delai' ? 'porte.delai' : 'porte.panne');
    return panne();
  }
  if ((recu as { autorisation?: unknown } | null)?.autorisation === 'refusee') return vide(401);
  const r = reponse.safeParse(recu);
  if (!r.success) { journaliser('porte.reponse_hors_schema'); return panne(); }
  return json(r.data);
};
