/**
 * Worker de la porte — api-recette.luminose.fr (SPEC §14.3, §14.5).
 *
 * Phase S2b, partie A : l'essai à blanc. Une adresse, `POST /v1/essai`, qui
 * appelle l'entrée `Essai` de gestion par la liaison de service et rend sa
 * réponse. Toute autre adresse : 404, corps vide.
 *
 * Ce que l'essai doit montrer (§14.3) : que l'appel traverse, qu'aucune adresse
 * ne mène aux entrées de gestion, et ce que deux Workers et une liaison coûtent
 * en temps de calcul et en sous-requêtes sur le plan gratuit.
 *
 * Ce Worker n'importe rien de `workers/api` : il ne connaît de gestion que les
 * interfaces de `packages/contrat`.
 */
import type { EntreeEssai } from '@luminose/contrat';
import { introuvable, journaliser, json, panne } from './reponses.ts';

export type Env = {
  ENVIRONNEMENT?: string;
  /** La liaison vers l'entrée `Essai` de gestion. Absente — la racine, jamais déployée — : panne. */
  GESTION_ESSAI?: Pick<EntreeEssai, 'ping'>;
};

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
  // Re-sérialisé depuis la forme attendue, jamais recopié : une réponse de
  // gestion qui n'a pas cette forme est une panne, pas un corps à relayer.
  const r = recu as { ok?: unknown; base?: unknown } | null;
  if (r?.ok !== true || typeof r.base !== 'boolean') {
    journaliser('porte.reponse_hors_schema');
    return panne();
  }
  return json({ ok: true, base: r.base });
};

export default {
  async fetch(requete: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(requete.url);
    if (requete.method === 'POST' && pathname === '/v1/essai') return essai(env);
    return introuvable();
  },
};
