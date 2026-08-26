/**
 * Clés des fournisseurs d'IA.
 *
 * Elles vivaient uniquement dans les secrets du Worker ; elles peuvent
 * désormais être posées depuis l'administration et sont alors stockées dans
 * `app_settings`, sous `provider_key:<adaptateur>`.
 *
 * L'invariant tient toujours : **une clé ne ressort jamais de ce Worker**.
 * Elle entre (PUT), elle sert (chat, test), elle s'efface (DELETE) — mais
 * aucune route ne la relit vers le client. L'administration n'en voit que
 * l'empreinte, quatre caractères : assez pour reconnaître laquelle est posée,
 * trop peu pour s'en servir.
 *
 * Le repli sur la variable d'environnement est conservé : un déploiement qui
 * pose ses secrets avec `wrangler secret put` continue de fonctionner sans que
 * personne ait à toucher à l'interface.
 */
import type { Env } from './env';

const PREFIX = 'provider_key:';

/** Modèle affecté à une action, dans la même table (`action_model:<ACTION>`). */
const ACTION_PREFIX = 'action_model:';

export const settingKeyForAction = (action: string) => `${ACTION_PREFIX}${action}`;
export const ACTION_PATTERN = `${ACTION_PREFIX}%`;

/** Tri et filtre retenus par une liste (`vue:<id>`), dans la même table. */
const VUE_PREFIX = 'vue:';

export const settingKeyForVue = (vue: string) => `${VUE_PREFIX}${vue}`;
export const VUE_PATTERN = `${VUE_PREFIX}%`;
export const vueFromSettingKey = (key: string) => key.slice(VUE_PREFIX.length);

/**
 * Où en est chaque surface vis-à-vis du corpus.
 *
 * Même table que les vues et les clés (`app_settings`) : c'est un réglage du
 * compte, pas une donnée métier. Une ligne par surface, sa valeur en JSON.
 */
const POSE_PREFIX = 'contexte_pose:';
export const settingKeyForPose = (surface: string) => `${POSE_PREFIX}${surface}`;
export const POSE_PATTERN = `${POSE_PREFIX}%`;
export const poseFromSettingKey = (key: string) => key.slice(POSE_PREFIX.length);

export const settingKeyFor = (providerId: string) => `${PREFIX}${providerId}`;

/** Les lignes de `app_settings` qui portent une clé — à ne jamais exporter (§9.4). */
export const KEY_PATTERN = `${PREFIX}%`;

/** Variable d'environnement historique de chaque adaptateur. */
const ENV_VARS: Record<string, keyof Env> = {
  onemin: 'ONE_MIN_API_KEY',
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

const clean = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
};

/** 1 requête. La clé posée en base, si elle existe. */
export const readStoredKey = async (env: Env, providerId: string): Promise<string | null> => {
  const row = await env.DB
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .bind(settingKeyFor(providerId)).first();
  return clean(row?.value);
};

export const readEnvKey = (env: Env, providerId: string): string | null => {
  const name = ENV_VARS[providerId];
  return name ? clean(env[name]) : null;
};

/** D'abord la base, ensuite l'environnement : l'administration a le dernier mot. */
export const resolveApiKey = async (env: Env, providerId: string): Promise<string | null> =>
  (await readStoredKey(env, providerId)) ?? readEnvKey(env, providerId);

/**
 * Empreinte affichable d'une clé. Quatre caractères, jamais plus : on doit
 * pouvoir dire « c'est bien celle-là » sans pouvoir la rejouer.
 */
export const fingerprint = (key: string): string => `…${key.slice(-4)}`;
