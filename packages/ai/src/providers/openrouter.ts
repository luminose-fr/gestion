/**
 * Adaptateur OpenRouter.
 *
 * OpenRouter expose l'API `/chat/completions` d'OpenAI : l'adaptateur se
 * résume donc à une URL de base et un identifiant. C'est exactement ce que le
 * port promettait (SPEC §5.2) — un second fournisseur qui n'oblige à
 * réimplémenter personne.
 *
 * Ce qu'il apporte au produit : un seul compte pour joindre Claude, GPT,
 * Gemini, Llama et les autres, avec un code modèle préfixé par son éditeur
 * (`anthropic/claude-sonnet-4.5`, `openai/gpt-5.2-pro`). Le catalogue n'a donc
 * rien de spécial à apprendre : c'est un `api_code` de plus.
 */
import type { AIProvider, ProviderConfig } from '../port';
import { createOpenAIProvider } from './openai';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export const createOpenRouterProvider = (config: ProviderConfig): AIProvider =>
    createOpenAIProvider({ ...config, baseUrl: config.baseUrl ?? OPENROUTER_BASE_URL }, 'openrouter');
