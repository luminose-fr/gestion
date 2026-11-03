/**
 * Réglages de l'application : clés des fournisseurs, modèle par action, et ce
 * que chaque liste retient de son tri.
 *
 * **Écriture seule.** Une clé entre par PUT, sert au Worker, s'efface par
 * DELETE — mais aucune route ne la renvoie. La liste ne porte qu'une
 * empreinte de quatre caractères et l'origine de la clé (base ou
 * environnement). C'est ce qui permet de poser ses clés depuis
 * l'administration sans qu'elles reviennent jamais dans le navigateur.
 */
import { Hono } from 'hono';
import { PROVIDER_IDS } from '@luminose/ai';
import { CONFIGURABLE_ACTIONS, FAMILLES_MODELE, sortieDeFamille } from '@luminose/editorial';
import { SetProviderKeySchema, SetActionModelSchema, EtatDeVueSchema, VUES, PoseSchema, SURFACES } from '@luminose/shared';
import type { Env } from '../env';
import { now } from '../db';
import { readEnvKey, settingKeyFor, settingKeyForAction, settingKeyForFamille, settingKeyForVue, vueFromSettingKey, VUE_PATTERN, settingKeyForPose, poseFromSettingKey, POSE_PATTERN, fingerprint } from '../keys';

export const settings = new Hono<{ Bindings: Env }>();

/** Libellés d'affichage — le vocabulaire du produit, pas celui du code. */
const LABELS: Record<string, string> = {
  onemin: '1min.ai',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic (Claude en direct)',
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

// ── Modèle par famille, et par action (les « presets ») ──────────────────

/**
 * Quel modèle sert quel travail. Depuis le 03/11/2026, on règle une famille —
 * Juger, Recopier, Synthétiser, Porter la voix, Illustrer — et une action peut
 * encore avoir le sien, qui l'emporte. Sans réglage, une action prend le modèle
 * de sa famille, puis le modèle actif : le comportement d'avant reste le repli.
 *
 * 1 requête : toutes les affectations d'un coup.
 */
settings.get('/actions', async (c) => {
  const { results } = await c.env.DB
    .prepare("SELECT key, value FROM app_settings WHERE key LIKE 'action_model:%' OR key LIKE 'famille_model:%'")
    .all();

  const actions: Record<string, string> = {};
  const familles: Record<string, string> = {};
  for (const row of results as any[]) {
    const cle = String(row.key);
    if (!row.value) continue;
    // Une action ou une famille inconnue en base (renommée, retirée) ne remonte
    // pas : elle n'a plus de sens et encombrerait l'écran de réglage.
    if (cle.startsWith('action_model:')) {
      const action = cle.slice('action_model:'.length);
      if (CONFIGURABLE_ACTIONS.includes(action)) actions[action] = String(row.value);
    } else {
      const famille = cle.slice('famille_model:'.length);
      if ((FAMILLES_MODELE as readonly string[]).includes(famille)) familles[famille] = String(row.value);
    }
  }
  return c.json({ actions, familles });
});

/**
 * Le modèle visé : il existe, et il produit ce que le réglage attend — un modèle
 * d'image n'écrit pas, un modèle de texte n'illustre pas. 1 requête.
 */
const modeleAttendu = async (env: Env, modelId: string, sortie: 'texte' | 'image') => {
  const model = await env.DB
    .prepare('SELECT id, name, sortie FROM ai_models WHERE id = ? AND deleted_at IS NULL')
    .bind(modelId).first<{ id: string; name: string; sortie: string | null }>();
  if (!model) return 'Modèle introuvable dans le catalogue';
  if ((model.sortie ?? 'texte') !== sortie) {
    return sortie === 'image'
      ? `« ${model.name} » est un modèle de texte : Illustrer attend un modèle d'image.`
      : `« ${model.name} » est un modèle d'image : il n'écrit pas.`;
  }
  return null;
};

const poserReglage = (env: Env, cle: string, modelId: string) =>
  env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(cle, modelId, now()).run();

/** 2 requêtes. `null` remet la famille sur le repli. */
settings.put('/familles/:famille', async (c) => {
  const famille = c.req.param('famille');
  if (!(FAMILLES_MODELE as readonly string[]).includes(famille)) {
    return c.json({ error: `Famille inconnue : « ${famille} ».` }, 404);
  }
  const { modelId } = SetActionModelSchema.parse(await c.req.json());
  if (modelId === null) {
    await c.env.DB.prepare('DELETE FROM app_settings WHERE key = ?').bind(settingKeyForFamille(famille)).run();
    return c.json({ famille, modelId: null });
  }
  const refus = await modeleAttendu(c.env, modelId, sortieDeFamille(famille));
  if (refus) return c.json({ error: refus }, refus.startsWith('Modèle introuvable') ? 404 : 409);
  await poserReglage(c.env, settingKeyForFamille(famille), modelId);
  return c.json({ famille, modelId });
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

  // `null` remet l'action sur le modèle de sa famille.
  if (modelId === null) {
    await c.env.DB.prepare('DELETE FROM app_settings WHERE key = ?')
      .bind(settingKeyForAction(action)).run();
    return c.json({ action, modelId: null });
  }

  const refus = await modeleAttendu(c.env, modelId, 'texte');
  if (refus) return c.json({ error: refus }, refus.startsWith('Modèle introuvable') ? 404 : 409);
  await poserReglage(c.env, settingKeyForAction(action), modelId);
  return c.json({ action, modelId });
});

// ── Tri et filtre retenus par les listes ─────────────────────────────────

const safeJson = (value: unknown): unknown => {
  try { return JSON.parse(String(value)); } catch { return null; }
};

/**
 * Ce que chaque liste retient d'une visite à l'autre.
 *
 * Le réglage vit ICI et pas dans le navigateur : Florent travaille depuis
 * plusieurs postes, et un tri qu'il faut refaire à chaque machine n'est pas un
 * réglage, c'est une corvée qui revient.
 *
 * 1 requête : tous les états d'un coup (SPEC §3.6).
 */
settings.get('/vues', async (c) => {
  const { results } = await c.env.DB
    .prepare('SELECT key, value FROM app_settings WHERE key LIKE ?')
    .bind(VUE_PATTERN).all();

  const vues: Record<string, unknown> = {};
  for (const row of results as any[]) {
    const vue = vueFromSettingKey(String(row.key));
    if (!VUES.includes(vue as any)) continue;
    // Une valeur illisible en base ne doit pas empêcher les autres listes de
    // retrouver leur tri : on l'ignore, la liste repart sur son défaut.
    const lu = EtatDeVueSchema.safeParse(safeJson(row.value));
    if (lu.success) vues[vue] = lu.data;
  }
  return c.json({ vues });
});

/** 1 requête. Pose le tri et le filtre d'une liste. */
settings.put('/vues/:vue', async (c) => {
  const vue = c.req.param('vue');
  if (!VUES.includes(vue as any)) {
    return c.json({ error: `Liste inconnue : « ${vue} ».` }, 404);
  }

  const etat = EtatDeVueSchema.parse(await c.req.json());
  const ts = now();

  await c.env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(settingKeyForVue(vue), JSON.stringify(etat), ts).run();

  return c.json({ vue, etat });
});

// ── Corpus : où en est chaque surface ────────────────────────────────────

/**
 * 1 requête. Ce que chaque surface porte aujourd'hui.
 *
 * Le Worker ne compare rien : il rend les poses, l'écran les confronte aux
 * hashs courants qu'il a déjà par `/api/corpus`. Faire la comparaison ici
 * obligerait à composer les trois profils pour répondre à une question de
 * réglage.
 */
settings.get('/poses', async (c) => {
  const { results } = await c.env.DB
    .prepare('SELECT key, value, updated_at FROM app_settings WHERE key LIKE ?')
    .bind(POSE_PATTERN).all();

  const poses: Record<string, unknown> = {};
  for (const row of results as any[]) {
    const surface = poseFromSettingKey(String(row.key));
    if (!SURFACES.includes(surface as any)) continue;
    // Une valeur illisible ne doit pas emporter les autres surfaces : on
    // l'ignore, la surface repart comme jamais posée.
    const lu = PoseSchema.safeParse(safeJson(row.value));
    if (lu.success) poses[surface] = { ...lu.data, poseeLe: row.updated_at as number };
  }
  return c.json({ poses });
});

/** 1 requête. « Je viens de coller ce texte sur cette surface. » */
settings.put('/poses/:surface', async (c) => {
  const surface = c.req.param('surface');
  if (!SURFACES.includes(surface as any)) {
    return c.json({ error: `Surface inconnue : « ${surface} ».` }, 404);
  }

  const pose = PoseSchema.parse(await c.req.json());
  const ts = now();

  await c.env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(settingKeyForPose(surface), JSON.stringify(pose), ts).run();

  return c.json({ surface, pose: { ...pose, poseeLe: ts } });
});
