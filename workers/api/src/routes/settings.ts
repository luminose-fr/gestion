/**
 * Réglages de l'application — pour l'instant, les clés des fournisseurs d'IA.
 *
 * **Écriture seule.** Une clé entre par PUT, sert au Worker, s'efface par
 * DELETE — mais aucune route ne la renvoie. La liste ne porte qu'une
 * empreinte de quatre caractères et l'origine de la clé (base ou
 * environnement). C'est ce qui permet de poser ses clés depuis
 * l'administration sans qu'elles reviennent jamais dans le navigateur.
 */
import { Hono } from 'hono';
import { PROVIDER_IDS } from '@luminose/ai';
import { CONFIGURABLE_ACTIONS } from '@luminose/editorial';
import { SetProviderKeySchema, SetActionModelSchema } from '@luminose/shared';
import type { Env } from '../env';
import { now } from '../db';
import { readEnvKey, settingKeyFor, settingKeyForAction, fingerprint } from '../keys';

export const settings = new Hono<{ Bindings: Env }>();

/** Libellés d'affichage — le vocabulaire du produit, pas celui du code. */
const LABELS: Record<string, string> = {
  onemin: '1min.ai',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
};

/**
 * 1 requête, quel que soit le nombre d'adaptateurs : on lit toutes les clés
 * posées d'un coup plutôt qu'une par fournisseur (SPEC §3.6).
 */
settings.get('/providers', async (c) => {
  const { results } = await c.env.DB
    .prepare("SELECT key, value, updated_at FROM app_settings WHERE key LIKE 'provider_key:%'")
    .all();

  const stored = new Map(
    (results as any[]).map((r) => [String(r.key), { value: String(r.value ?? ''), updatedAt: r.updated_at as number }])
  );

  const providers = PROVIDER_IDS.map((id) => {
    const enBase = stored.get(settingKeyFor(id));
    const cleEnBase = enBase?.value.trim();
    const cleEnv = readEnvKey(c.env, id);
    const clef = cleEnBase || cleEnv;

    return {
      id,
      label: LABELS[id] ?? id,
      configured: !!clef,
      // Jamais la clé : son empreinte seulement.
      hint: clef ? fingerprint(clef) : null,
      source: cleEnBase ? 'base' : cleEnv ? 'environnement' : null,
      updatedAt: cleEnBase ? enBase!.updatedAt : null,
    };
  });

  return c.json({ providers });
});

/** 1 requête. Remplace la clé de ce fournisseur, ou la pose. */
settings.put('/providers/:id', async (c) => {
  const id = c.req.param('id');
  if (!PROVIDER_IDS.includes(id)) {
    return c.json({ error: `Fournisseur inconnu : « ${id} ».` }, 404);
  }

  const { apiKey } = SetProviderKeySchema.parse(await c.req.json());
  const ts = now();

  await c.env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(settingKeyFor(id), apiKey.trim(), ts).run();

  // La réponse dit ce qui a été posé, pas ce que ça vaut.
  return c.json({ id, configured: true, hint: fingerprint(apiKey.trim()), source: 'base', updatedAt: ts });
});

/**
 * 1 requête. Effacer la clé de la base fait retomber le fournisseur sur la
 * variable d'environnement, s'il y en a une — ce n'est donc pas forcément
 * couper l'accès, et la réponse le dit.
 */
settings.delete('/providers/:id', async (c) => {
  const id = c.req.param('id');
  if (!PROVIDER_IDS.includes(id)) {
    return c.json({ error: `Fournisseur inconnu : « ${id} ».` }, 404);
  }

  await c.env.DB.prepare('DELETE FROM app_settings WHERE key = ?').bind(settingKeyFor(id)).run();

  const repli = readEnvKey(c.env, id);
  return c.json({ id, configured: !!repli, source: repli ? 'environnement' : null });
});

// ── Modèle par action (les « presets ») ──────────────────────────────────

/**
 * Quel modèle sert quelle action. Sans réglage, l'action prend le modèle actif
 * — c'est le comportement d'avant, et il reste le repli.
 *
 * 1 requête : toutes les affectations d'un coup.
 */
settings.get('/actions', async (c) => {
  const { results } = await c.env.DB
    .prepare("SELECT key, value FROM app_settings WHERE key LIKE 'action_model:%'")
    .all();

  const actions: Record<string, string> = {};
  for (const row of results as any[]) {
    const action = String(row.key).slice('action_model:'.length);
    // Une action inconnue en base (renommée, retirée) ne remonte pas : elle
    // n'a plus de sens et encombrerait l'écran de réglage.
    if (CONFIGURABLE_ACTIONS.includes(action) && row.value) actions[action] = String(row.value);
  }
  return c.json({ actions });
});

/**
 * 2 requêtes : on vérifie que le modèle existe avant de l'affecter. Un preset
 * qui pointe vers un modèle supprimé échouerait au moment de rédiger — c'est-à-dire
 * au pire moment.
 */
settings.put('/actions/:action', async (c) => {
  const action = c.req.param('action');
  if (!CONFIGURABLE_ACTIONS.includes(action)) {
    return c.json({ error: `Action inconnue : « ${action} ».` }, 404);
  }

  const { modelId } = SetActionModelSchema.parse(await c.req.json());
  const ts = now();

  // `null` remet l'action sur le modèle actif.
  if (modelId === null) {
    await c.env.DB.prepare('DELETE FROM app_settings WHERE key = ?')
      .bind(settingKeyForAction(action)).run();
    return c.json({ action, modelId: null });
  }

  const model = await c.env.DB
    .prepare('SELECT id FROM ai_models WHERE id = ? AND deleted_at IS NULL')
    .bind(modelId).first();
  if (!model) return c.json({ error: 'Modèle introuvable dans le catalogue' }, 404);

  await c.env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(settingKeyForAction(action), modelId, ts).run();

  return c.json({ action, modelId });
});
