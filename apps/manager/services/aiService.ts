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
  /** Ce que Florent a demandé, en clair — « Relecture à froid ». Sert au message d'échec. */
  action?: string;
}

// ── Les échecs se montrent TOUS, et de la même façon ─────────────────────

/** Un appel IA qui a échoué, tel qu'il doit être annoncé. */
export interface EchecIA {
  /** Le libellé de l'action, quand l'appelant l'a donné. */
  action: string | null;
  message: string;
  /** Horodatage : deux échecs identiques restent deux événements distincts. */
  at: number;
}

const temoins = new Set<(echec: EchecIA) => void>();

/**
 * S'abonner aux échecs d'appel IA. Rend la fonction de désabonnement.
 *
 * Pourquoi le signalement vit ICI et pas chez les appelants : le 24/08/2026,
 * une « Lecture froide » a échoué faute de crédits sans qu'aucun message ne
 * s'affiche — l'appelant avalait l'erreur pour ne pas bloquer la rédaction.
 * Sept appelants qui doivent chacun penser à afficher, c'est sept occasions
 * d'oublier. Un seul passage obligé, c'est zéro.
 */
export const surEchecIA = (temoin: (echec: EchecIA) => void): (() => void) => {
  temoins.add(temoin);
  return () => { temoins.delete(temoin); };
};

/**
 * Vrai si cette erreur a DÉJÀ été annoncée par le passage obligé. Les appelants
 * s'en servent pour ne pas la montrer une seconde fois à leur façon.
 */
export const estSignalee = (e: unknown): boolean => Boolean((e as any)?.signaleeIA);

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

  try {
    const { text } = await post<{ text: string; modelLabel: string }>('/ai/chat', {
      modelId: request.modelId,
      system: request.systemInstruction,
      messages,
      json: request.json,
    });
    return text;
  } catch (e: any) {
    // Marquée d'abord : l'appelant doit pouvoir savoir qu'elle est déjà annoncée,
    // même s'il la reçoit après plusieurs relances.
    if (e && typeof e === 'object') (e as any).signaleeIA = true;
    const echec: EchecIA = {
      action: request.action ?? null,
      message: e?.message || 'Erreur inconnue.',
      at: Date.now(),
    };
    // Un témoin qui jette ne doit pas empêcher les autres d'être prévenus, ni
    // remplacer l'erreur d'origine par la sienne.
    for (const temoin of temoins) {
      try { temoin(echec); } catch { /* un abonné défaillant ne masque rien */ }
    }
    throw e;
  }
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
