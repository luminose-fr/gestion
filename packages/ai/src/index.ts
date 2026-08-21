/**
 * packages/ai — l'abstraction fournisseur (SPEC §5).
 *
 * Le front n'importe JAMAIS ce package : les clés vivent dans le Worker
 * (CLAUDE.md règle 1). Il envoie un identifiant de modèle, le Worker résout la
 * ligne du catalogue, lit sa colonne `provider` et choisit l'adaptateur.
 *
 * Changer de fournisseur pour un modèle = changer une valeur en base.
 */
export * from './port';
export { createOneMinProvider, flattenConversation, extractText, findBusinessError } from './providers/onemin';
export { createOpenAIProvider } from './providers/openai';
export { createOpenRouterProvider, OPENROUTER_BASE_URL } from './providers/openrouter';

import type { AIProvider, ProviderConfig } from './port';
import { createOneMinProvider } from './providers/onemin';
import { createOpenAIProvider } from './providers/openai';
import { createOpenRouterProvider } from './providers/openrouter';

/** Fabriques disponibles, indexées par la valeur de `ai_models.provider`. */
export const PROVIDER_FACTORIES: Record<string, (config: ProviderConfig) => AIProvider> = {
  onemin: createOneMinProvider,
  openai: (config) => createOpenAIProvider(config),
  openrouter: createOpenRouterProvider,
};

export const PROVIDER_IDS = Object.keys(PROVIDER_FACTORIES);

/**
 * Résout un adaptateur. Lève si la valeur stockée ne correspond à rien —
 * mieux vaut une erreur nette qu'un repli silencieux vers un autre
 * fournisseur, qui facturerait le mauvais compte sans prévenir.
 */
export const getProvider = (providerId: string, config: ProviderConfig): AIProvider => {
  const factory = PROVIDER_FACTORIES[providerId];
  if (!factory) {
    throw new Error(
      `Fournisseur inconnu : « ${providerId} ». Connus : ${PROVIDER_IDS.join(', ')}.`
    );
  }
  return factory(config);
};
