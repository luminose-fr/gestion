/**
 * Routes IA (SPEC §3.5).
 *
 * Le front envoie un IDENTIFIANT DE MODÈLE, jamais un fournisseur. Le Worker
 * lit la ligne du catalogue, prend sa colonne `provider` comme clé de routage
 * et instancie l'adaptateur correspondant.
 *
 * Conséquence : faire passer un modèle de 1min.ai à un accès direct se fait en
 * changeant une valeur en base, sans toucher au code ni redéployer le front.
 */
import { Hono } from 'hono';
import { getProvider, PROVIDER_IDS, type AIProvider } from '@luminose/ai';
import { ChatRequestSchema, TestModelSchema } from '@luminose/shared';
import type { Env } from '../env';
import { rowToModel } from '../db';
import { resolveApiKey } from '../keys';

export const ai = new Hono<{ Bindings: Env }>();

/**
 * Résout un adaptateur : d'abord son existence, ensuite sa clé. Inverser les
 * deux produirait un message trompeur pour un fournisseur inconnu — le
 * problème serait alors qu'aucun adaptateur ne porte ce nom, pas qu'une clé
 * manque.
 *
 * 1 requête (la clé posée en base) ; l'environnement sert de repli.
 */
const resolve = async (providerId: string, env: Env): Promise<AIProvider> => {
  if (!PROVIDER_IDS.includes(providerId)) {
    throw new Error(
      `Fournisseur inconnu : « ${providerId} ». Connus : ${PROVIDER_IDS.join(', ')}.`
    );
  }

  const apiKey = await resolveApiKey(env, providerId);
  if (!apiKey) {
    throw new Error(
      `Aucune clé configurée pour le fournisseur « ${providerId} ». ` +
      `Renseignez-la dans Réglages → Fournisseurs.`
    );
  }
  return getProvider(providerId, { apiKey });
};

/** 1 requête : la ligne du modèle. */
export const loadModel = async (env: Env, id: string) => {
  const row = await env.DB
    .prepare('SELECT * FROM ai_models WHERE id = ? AND deleted_at IS NULL')
    .bind(id).first();
  return row ? rowToModel(row) : null;
};

ai.post('/chat', async (c) => {
  const input = ChatRequestSchema.parse(await c.req.json());

  const model = await loadModel(c.env, input.modelId);
  if (!model) return c.json({ error: 'Modèle introuvable dans le catalogue' }, 404);

  // L'ordre compte : on valide d'abord que l'adaptateur existe (voir resolve)
  const provider = await resolve(model.provider, c.env);

  let result;
  try {
    result = await provider.chat({
      model: model.apiCode,
      system: input.system,
      messages: input.messages,
      json: input.json,
    });
  } catch (e: any) {
    // Une panne du fournisseur n'est pas une panne du Worker : 502, et son
    // message EN CLAIR. Passer par le gestionnaire générique le reléguerait
    // dans `detail`, et le front afficherait « Erreur interne » là où le
    // fournisseur disait précisément ce qui manquait (crédits, quota, modèle
    // retiré). C'est la différence entre un diagnostic et une devinette.
    return c.json({ error: e?.message ?? 'Le fournisseur IA n’a pas répondu.' }, 502);
  }

  // `raw` reste au Worker : le front n'a que faire de la forme du fournisseur,
  // et la lui exposer inviterait à s'y accrocher. Le DÉCOMPTE, lui, remonte :
  // c'est le front qui journalise la production, donc lui qui doit pouvoir y
  // attacher ce qu'elle a coûté (SPEC §2.6).
  return c.json({ text: result.text, modelLabel: model.name, usage: result.usage });
});

/**
 * Vérifie qu'un code d'API répond réellement, au coût le plus bas (SPEC §5.4).
 *
 * Il porte sur un CODE, pas sur un modèle du catalogue : le testeur sert
 * précisément à valider avant d'enregistrer. C'est l'adaptateur du fournisseur
 * qui sait comment sonder son API — le test est devenu générique.
 */
ai.post('/test', async (c) => {
  const { apiCode, provider } = TestModelSchema.parse(await c.req.json());
  const adaptateur = await resolve(provider, c.env);
  return c.json(await adaptateur.test(apiCode));
});
