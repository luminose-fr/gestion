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
import { SetProviderKeySchema } from '@luminose/shared';
import type { Env } from '../env';
import { now } from '../db';
import { readStoredKey, readEnvKey, settingKeyFor, fingerprint } from '../keys';

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
