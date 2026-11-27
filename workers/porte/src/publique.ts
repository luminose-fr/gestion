/**
 * La porte publique (SPEC §14.5) : `POST /v1/questionnaires` et
 * `POST /v1/questionnaires/lien`.
 *
 * **Avant d'appeler gestion**, dans cet ordre : l'origine, le type, la taille,
 * la limite de fréquence, le champ piège, le schéma du contrat. Tout refus de la
 * porte se dit sans appeler gestion. **Gestion revalide** : la porte protège
 * gestion du bruit, gestion ne fait confiance à personne (§14.3) ; l'envoi lui
 * est donc confié tel qu'il est arrivé, pas tel que la porte l'a lu.
 *
 * **Ce qu'elle rend** est re-sérialisé depuis `reponseSansDonnee` : un champ de
 * plus venu de gestion est une panne, pas un corps à relayer (règle 4).
 */
import {
  invalide, refuser, valider, champPiegeRempli, reponseSansDonnee,
  questionnaire as schemaQuestionnaire, lienQuestionnaire as schemaLien,
  type PortePublique, type Reponse,
} from '@luminose/contrat';
import type { Env, Limiteur } from './env.ts';
import { entetesPublics, origineAdmise } from './cors.ts';
import { typeJson, lireCorps, avecDelai } from './bornes.ts';
import { limiteAtteinte } from './limite.ts';
import { json, vide, panne, journaliser } from './reponses.ts';

/** Au-delà, gestion est en panne pour la porte. */
export const DELAI_MS = 10_000;

export type RoutePublique = {
  /** La clé de la limite de fréquence ; jamais le nom d'une table. */
  nom: 'questionnaire' | 'lien';
  limiteur: (env: Env) => Limiteur | undefined;
  piege: boolean;
  schema: Parameters<typeof valider>[0];
  appeler: (gestion: PortePublique, envoi: unknown) => Promise<Reponse>;
};

export const QUESTIONNAIRE: RoutePublique = {
  nom: 'questionnaire',
  limiteur: (env) => env.LIMITE_QUESTIONNAIRES,
  piege: true,
  schema: schemaQuestionnaire,
  appeler: (g, envoi) => g.questionnaire(envoi),
};

export const LIEN: RoutePublique = {
  nom: 'lien',
  limiteur: (env) => env.LIMITE_LIENS,
  piege: false,
  schema: schemaLien,
  appeler: (g, envoi) => g.lienQuestionnaire(envoi),
};

export const porterPublique = async (requete: Request, env: Env, route: RoutePublique): Promise<Response> => {
  const site = env.ORIGINE_SITE;
  // Sans origine du site, la porte ne sait pas qui admettre : une panne, pas une porte ouverte.
  if (!site) { journaliser('porte.non_configuree'); return panne(); }
  const entetes = entetesPublics(site);

  // 1. L'origine.
  if (!origineAdmise(requete, site)) return vide(403, entetes);
  // 2. Le type (la méthode est déjà POST : le routage n'admet rien d'autre).
  if (!typeJson(requete)) return vide(415, entetes);
  // 3. La taille, sur les octets lus ; un JSON illisible est invalide, sans champs.
  const lecture = await lireCorps(requete);
  if (lecture.etat === 'trop_gros') return vide(413, entetes);
  if (lecture.etat === 'illisible') return json(invalide(), entetes);

  // 4. La limite de fréquence. Sans limiteur, une panne : jamais une porte sans limite.
  const limiteur = route.limiteur(env);
  if (!limiteur) { journaliser('porte.non_configuree'); return panne(entetes); }
  try {
    if (await limiteAtteinte(limiteur, requete, route.nom)) return json(refuser('trop_de_demandes'), entetes);
  } catch {
    journaliser('porte.limite');
    return panne(entetes);
  }

  // 5. Le champ piège : une erreur visible, sans champ nommé (§14.6.1, point 4).
  if (route.piege && champPiegeRempli(lecture.valeur)) return json(invalide(), entetes);
  // 6. Le schéma : les noms des champs, aucune valeur.
  const v = valider(route.schema, lecture.valeur);
  if (!v.valide) return json(v.refus, entetes);

  // Gestion.
  const gestion = env.GESTION_PUBLIQUE;
  if (!gestion) { journaliser('porte.non_reliee'); return panne(entetes); }
  let recu: unknown;
  try {
    recu = await avecDelai(route.appeler(gestion, lecture.valeur), DELAI_MS);
  } catch (erreur) {
    journaliser(erreur instanceof Error && erreur.message === 'porte.delai' ? 'porte.delai' : 'porte.panne');
    return panne(entetes);
  }
  const r = reponseSansDonnee.safeParse(recu);
  if (!r.success) { journaliser('porte.reponse_hors_schema'); return panne(entetes); }
  return json(r.data, entetes);
};
