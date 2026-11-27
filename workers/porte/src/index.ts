/**
 * Worker de la porte — api-recette.luminose.fr (SPEC §14.3, §14.5).
 *
 * Ce qu'elle accepte, et rien d'autre :
 *
 *   POST    /v1/questionnaires           → PortePublique.questionnaire
 *   POST    /v1/questionnaires/lien      → PortePublique.lienQuestionnaire
 *   OPTIONS sur les deux                 → la réponse de CORS, sans gestion
 *   POST    /service/v1/confirmations    → PorteService.confirmation
 *   POST    /v1/essai                    → Essai.ping (l'essai à blanc, partie A)
 *
 * Toute autre adresse ou méthode : 404, corps vide.
 *
 * En recette seulement, l'hôte du site (`ORIGINE_SITE`, essai-recette) sert la
 * page d'essai sur `GET /`, et rien d'autre — pas même les adresses de la
 * porte : chaque origine a son rôle, et CORS s'essaie entre les deux.
 *
 * Ce Worker n'importe rien de `workers/api` : il ne connaît de gestion que les
 * interfaces de `packages/contrat`. Il ne journalise jamais le corps, l'adresse
 * IP, l'en-tête `Authorization` ni la référence d'un lien : une panne se dit
 * par un code fixe (reponses.ts).
 */
import type { Env } from './env.ts';
import { introuvable, journaliser, json, panne } from './reponses.ts';
import { preliminaire } from './cors.ts';
import { porterPublique, QUESTIONNAIRE, LIEN } from './publique.ts';
import { porterService } from './service.ts';
import { pageDEssai, entetesDeLaPage } from './essai/page.ts';

export type { Env } from './env.ts';

const essai = async (env: Env): Promise<Response> => {
  if (!env.GESTION_ESSAI) {
    journaliser('porte.non_reliee');
    return panne();
  }
  let recu: unknown;
  try {
    recu = await env.GESTION_ESSAI.ping();
  } catch {
    journaliser('porte.panne');
    return panne();
  }
  // Re-sérialisé depuis la forme attendue, jamais recopié.
  const r = recu as { ok?: unknown; base?: unknown } | null;
  if (r?.ok !== true || typeof r.base !== 'boolean') {
    journaliser('porte.reponse_hors_schema');
    return panne();
  }
  return json({ ok: true, base: r.base });
};

const PUBLIQUES = { '/v1/questionnaires': QUESTIONNAIRE, '/v1/questionnaires/lien': LIEN } as const;

export default {
  async fetch(requete: Request, env: Env): Promise<Response> {
    const { pathname, host } = new URL(requete.url);

    if (env.ORIGINE_SITE && host === new URL(env.ORIGINE_SITE).host) {
      if (env.ENVIRONNEMENT === 'recette' && env.ORIGINE_PORTE && requete.method === 'GET' && pathname === '/') {
        return new Response(pageDEssai(env.ORIGINE_PORTE), { status: 200, headers: entetesDeLaPage(env.ORIGINE_PORTE) });
      }
      return introuvable();
    }

    const publique = Object.hasOwn(PUBLIQUES, pathname) ? PUBLIQUES[pathname as keyof typeof PUBLIQUES] : null;

    if (publique && requete.method === 'POST') return porterPublique(requete, env, publique);
    if (publique && requete.method === 'OPTIONS') {
      if (!env.ORIGINE_SITE) { journaliser('porte.non_configuree'); return panne(); }
      return preliminaire(env.ORIGINE_SITE);
    }
    if (requete.method === 'POST' && pathname === '/service/v1/confirmations') return porterService(requete, env);
    if (requete.method === 'POST' && pathname === '/v1/essai') return essai(env);
    return introuvable();
  },
};
