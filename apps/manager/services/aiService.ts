/**
 * Appels IA — le front ne connaît AUCUN fournisseur.
 *
 * Il envoie un identifiant de modèle du catalogue ; le Worker lit la colonne
 * `provider` de cette ligne et choisit l'adaptateur (SPEC §5.3). Passer un
 * modèle de 1min.ai à un accès direct ne demande donc aucune modification ici.
 *
 * Remplace oneMinService, qui portait les contorsions de 1min.ai jusque dans
 * l'application — aplatissement de l'historique compris.
 */
import { WORKER_URL } from '../constants';
import { getSessionToken } from '../auth';
import type { ChatMessage } from '@luminose/shared';

export interface GenerateRequest {
  /** Identifiant du modèle dans le catalogue — pas son code d'API. */
  modelId: string;
  prompt: string;
  systemInstruction?: string;
  /** Historique multi-tour. L'adaptateur s'arrange du format du fournisseur. */
  history?: ChatMessage[];
  /** Demander une sortie JSON stricte, si le fournisseur sait le faire. */
  json?: boolean;
}

const post = async <T>(path: string, payload: unknown): Promise<T> => {
  const res = await fetch(`${WORKER_URL}/api${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Token': getSessionToken() ?? '',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* réponse non-JSON */ }

  if (!res.ok) throw new Error(data?.error ?? `Erreur ${res.status}`);
  return data as T;
};

export const generateContent = async (request: GenerateRequest): Promise<string> => {
  const messages: ChatMessage[] = [
    ...(request.history ?? []),
    { role: 'user', content: request.prompt },
  ];

  const { text } = await post<{ text: string; modelLabel: string }>('/ai/chat', {
    modelId: request.modelId,
    system: request.systemInstruction,
    messages,
    json: request.json,
  });
  return text;
};

export interface ModelTestResult {
  available: boolean;
  error?: string;
  sample?: string;
  latencyMs?: number;
}

/**
 * Sonde un code d'API avant de l'enregistrer (SPEC §5.4).
 *
 * Porte sur un CODE et non sur un modèle du catalogue : au moment du test, le
 * modèle n'existe pas encore — c'est justement ce qu'on cherche à valider.
 */
export const testModel = (apiCode: string, provider = 'onemin') =>
  post<ModelTestResult>('/ai/test', { apiCode, provider });
