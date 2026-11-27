/**
 * Worker de la porte — api-recette.luminose.fr (SPEC §14.3, §14.5).
 *
 * Ce qu'elle accepte, et rien d'autre :
 *
 *   POST    /v1/questionnaires           → PortePublique.questionnaire
 *   POST    /v1/questionnaires/lien      → PortePublique.lienQuestionnaire
 *   OPTIONS sur les deux                 → la réponse de CORS, sans gestion
 *   POST    /service/v1/confirmations    → PorteService.confirmation
 *
 * Toute autre adresse ou méthode : 404, corps vide.
 *
 * En recette seulement, l'hôte de la page d'essai (`ORIGINE_ESSAI`,
 * essai-recette) sert cette page sur `GET /`, et rien d'autre — pas même les
 * adresses de la porte : chaque origine a son rôle, et CORS s'essaie entre les
 * deux. Le site de recette (`ORIGINE_SITE`, recette.luminose.fr) est admis aussi.
 *
 * Ce Worker n'importe rien de `workers/api` : il ne connaît de gestion que les
 * interfaces de `packages/contrat`. Il ne journalise jamais le corps, l'adresse
 * IP, l'en-tête `Authorization` ni la référence d'un lien : une panne se dit
 * par un code fixe (reponses.ts).
 */
import type { Env } from './env.ts';
import { introuvable, journaliser, panne } from './reponses.ts';
import { preliminaire, origineARendre, originesAdmises } from './cors.ts';
import { porterPublique, QUESTIONNAIRE, LIEN } from './publique.ts';
import { porterService } from './service.ts';
import { pageDEssai, entetesDeLaPage } from './essai/page.ts';

export type { Env } from './env.ts';

const PUBLIQUES = { '/v1/questionnaires': QUESTIONNAIRE, '/v1/questionnaires/lien': LIEN } as const;

export default {
  async fetch(requete: Request, env: Env): Promise<Response> {
    const { pathname, host } = new URL(requete.url);

    if (env.ORIGINE_ESSAI && host === new URL(env.ORIGINE_ESSAI).host) {
      if (env.ENVIRONNEMENT === 'recette' && env.ORIGINE_PORTE && requete.method === 'GET' && pathname === '/') {
        return new Response(pageDEssai(env.ORIGINE_PORTE), { status: 200, headers: entetesDeLaPage(env.ORIGINE_PORTE) });
      }
      return introuvable();
    }

    const publique = Object.hasOwn(PUBLIQUES, pathname) ? PUBLIQUES[pathname as keyof typeof PUBLIQUES] : null;

    if (publique && requete.method === 'POST') return porterPublique(requete, env, publique);
    if (publique && requete.method === 'OPTIONS') {
      if (!env.ORIGINE_SITE) { journaliser('porte.non_configuree'); return panne(); }
      return preliminaire(origineARendre(requete, originesAdmises(env)));
    }
    if (requete.method === 'POST' && pathname === '/service/v1/confirmations') return porterService(requete, env);
    return introuvable();
  },
};
