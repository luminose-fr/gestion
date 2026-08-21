/**
 * Adaptateur 1min.ai.
 *
 * L'API n'est pas standard, et c'est tout l'intérêt de l'isoler ici :
 *
 *   • elle n'accepte qu'un PROMPT UNIQUE — pas de tableau de messages, pas de
 *     rôle système. L'adaptateur aplatit donc la conversation en un bloc texte.
 *     Conséquence assumée : aucun cache de conversation côté serveur.
 *   • la réponse se cache dans `aiRecord.aiRecordDetail.resultObject[0]`, avec
 *     plusieurs formes constatées selon les versions — d'où les replis.
 *
 * Rien de tout cela ne doit remonter à l'appelant.
 */
import type { AIProvider, ChatRequest, ChatResult, ChatMessage, ProviderConfig, TestResult } from '../port';
import { stripCodeFences } from '../port';

const ENDPOINT = 'https://api.1min.ai/api/chat-with-ai';

/**
 * Aplatit une conversation en un seul prompt.
 *
 * Les étiquettes sont explicites plutôt que « user »/« assistant » : le modèle
 * reçoit un transcript à lire, pas un format d'API à interpréter.
 */
export const flattenConversation = (system: string | undefined, messages: ChatMessage[]): string => {
  const last = messages[messages.length - 1];
  const history = messages.slice(0, -1);

  let prompt = last?.content ?? '';

  if (history.length > 0) {
    const transcript = history
      .map((m) => `[${m.role === 'assistant' ? 'COACH' : 'FLORENT'}]\n${m.content}`)
      .join('\n\n');
    prompt =
      `HISTORIQUE DE LA CONVERSATION JUSQU'ICI :\n\n${transcript}\n\n---\n\n` +
      `MESSAGE ACTUEL DE FLORENT :\n${prompt}\n\n---\n\n` +
      `RÉPONDS MAINTENANT en tenant compte de tout l'historique.`;
  }

  return system ? `${system}\n\n---\n\n${prompt}` : prompt;
};

/**
 * 1min.ai répond 200 même quand il REFUSE la requête : l'erreur métier se
 * cache dans `resultObject`, qui devient alors un objet au lieu d'un tableau,
 * et `aiRecord.status` passe à FAILURE.
 *
 * Sans ce contrôle, un compte à court de crédits ressort en texte vide, et
 * l'application accuse le parseur (« réponse IA vide ou invalide ») pour un
 * problème de facturation. Le diagnostic part alors dans la mauvaise
 * direction — c'est arrivé le 21/08/2026, en pleine recette des Séries.
 */
export const findBusinessError = (payload: any): string | null => {
  const record = payload?.aiRecord;
  const result = record?.aiRecordDetail?.resultObject;

  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const detail = result.message ?? result.code;
    if (detail) return String(detail);
  }
  return record?.status === 'FAILURE' ? 'requête refusée, sans message' : null;
};

/** Réponse utile, quelle que soit la forme renvoyée. */
export const extractText = (payload: any): string => {
  const resultObject = payload?.aiRecord?.aiRecordDetail?.resultObject;
  if (Array.isArray(resultObject) && resultObject.length > 0) {
    return String(resultObject[0] ?? '');
  }
  return String(
    payload?.response ?? payload?.text ?? payload?.output ?? payload?.aiRecord?.response ?? ''
  );
};

const body = (model: string, prompt: string) => ({
  type: 'UNIFY_CHAT_WITH_AI',
  model,
  promptObject: {
    prompt,
    settings: {
      webSearchSettings: { webSearch: false },
      historySettings: { isMixed: false, historyMessageLimit: 1 },
      withMemories: false,
    },
  },
});

export const createOneMinProvider = (config: ProviderConfig): AIProvider => {
  const call = async (payload: unknown): Promise<any> => {
    const res = await fetch(config.baseUrl ?? ENDPOINT, {
      method: 'POST',
      headers: { 'API-KEY': config.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      // 1min.ai renvoie parfois du HTML d'erreur : on le dit clairement plutôt
      // que de laisser un JSON.parse échouer plus haut.
      throw new Error(
        `1min.ai a renvoyé une réponse invalide (${res.status}) : ${text.slice(0, 160)}`
      );
    }
    if (!res.ok) {
      throw new Error(data?.error ?? data?.message ?? `Erreur 1min.ai (${res.status})`);
    }
    return data;
  };

  return {
    id: 'onemin',

    async chat(req: ChatRequest): Promise<ChatResult> {
      const prompt = flattenConversation(req.system, req.messages);
      const payload = await call(body(req.model, prompt));

      const refus = findBusinessError(payload);
      if (refus) throw new Error(`1min.ai a refusé la requête : ${refus}`);

      return { text: stripCodeFences(extractText(payload)), raw: payload };
    },

    async test(model: string): Promise<TestResult> {
      const started = Date.now();
      if (!model.trim()) return { available: false, error: 'Code API vide.' };

      try {
        // Le prompt le plus court possible : quelques fractions de centime.
        const payload = await call(body(model.trim(), 'ping'));
        const refus = findBusinessError(payload);
        if (refus) return { available: false, error: refus, latencyMs: Date.now() - started };

        const sample = extractText(payload).replace(/\s+/g, ' ').trim();
        return {
          available: true,
          sample: sample ? sample.slice(0, 80) : '(réponse vide)',
          latencyMs: Date.now() - started,
        };
      } catch (e: any) {
        return { available: false, error: e?.message ?? 'Erreur inconnue', latencyMs: Date.now() - started };
      }
    },
  };
};
