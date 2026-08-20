/**
 * Le port des fournisseurs d'IA (SPEC §5.2).
 *
 * Volontairement ÉTROIT : pas de streaming, pas d'outils, pas de multimodal.
 * Le produit n'en a pas besoin, et chaque capacité ajoutée ici est une
 * capacité à réimplémenter pour chaque fournisseur.
 *
 * Le contrat est celui d'une conversation normale — un system prompt et une
 * suite de messages. Les fournisseurs qui ne savent pas faire (1min.ai n'a
 * qu'un prompt unique) s'en arrangent DANS leur adaptateur ; l'appelant ne
 * connaît jamais ces contorsions.
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  /** Identifiant du modèle, opaque et propre au fournisseur. */
  model: string;
  system?: string;
  messages: ChatMessage[];
  /** Demander une sortie JSON stricte, quand le fournisseur sait le faire. */
  json?: boolean;
}

export interface ChatResult {
  text: string;
  /** Réponse brute du fournisseur — pour le diagnostic, jamais pour la logique. */
  raw?: unknown;
}

export interface TestResult {
  available: boolean;
  error?: string;
  /** Début de la réponse — la preuve que le modèle a réellement répondu. */
  sample?: string;
  latencyMs?: number;
}

export interface AIProvider {
  /** Clé de routage, stockée dans `ai_models.provider` (SPEC §5.3). */
  readonly id: string;
  chat(req: ChatRequest): Promise<ChatResult>;
  /** Vérifie qu'un code modèle est accepté et répond, au coût le plus bas. */
  test(model: string): Promise<TestResult>;
}

/** Ce dont un adaptateur a besoin pour joindre son fournisseur. */
export interface ProviderConfig {
  apiKey: string;
  /** Surcharge de l'URL de base — utile pour les API compatibles OpenAI. */
  baseUrl?: string;
}

/** Retire les clôtures markdown qu'un modèle ajoute parfois autour du JSON. */
export const stripCodeFences = (text: string): string =>
  text.replace(/```json\s?/g, '').replace(/```\s?/g, '').trim();
