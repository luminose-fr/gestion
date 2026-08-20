/**
 * Adaptateur pour les API compatibles OpenAI (`/chat/completions`).
 *
 * Écrit dès maintenant alors qu'il n'est pas activé — c'est le critère de
 * sortie de la phase 6 (SPEC §11). Un port qu'on n'a implémenté qu'une fois
 * n'est pas un port : c'est le premier fournisseur déguisé. En écrire un
 * second est la seule façon de vérifier que l'abstraction tient.
 *
 * Il couvre bien plus qu'OpenAI : Groq, Together, OpenRouter, Mistral et la
 * plupart des passerelles exposent la même forme. Seul `baseUrl` change.
 */
import type { AIProvider, ChatRequest, ChatResult, ProviderConfig, TestResult } from '../port';
import { stripCodeFences } from '../port';

const DEFAULT_BASE = 'https://api.openai.com/v1';

export const createOpenAIProvider = (config: ProviderConfig, id = 'openai'): AIProvider => {
  const call = async (payload: unknown): Promise<any> => {
    const res = await fetch(`${config.baseUrl ?? DEFAULT_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${id} a renvoyé une réponse invalide (${res.status}) : ${text.slice(0, 160)}`);
    }
    if (!res.ok) {
      throw new Error(data?.error?.message ?? `Erreur ${id} (${res.status})`);
    }
    return data;
  };

  /** Ici le rôle système existe vraiment : aucun aplatissement à faire. */
  const buildMessages = (req: ChatRequest) => [
    ...(req.system ? [{ role: 'system' as const, content: req.system }] : []),
    ...req.messages,
  ];

  return {
    id,

    async chat(req: ChatRequest): Promise<ChatResult> {
      const data = await call({
        model: req.model,
        messages: buildMessages(req),
        // Mode JSON natif — 1min.ai ne l'a pas, d'où l'option et non l'obligation
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      });
      const text = String(data?.choices?.[0]?.message?.content ?? '');
      return { text: stripCodeFences(text), raw: data };
    },

    async test(model: string): Promise<TestResult> {
      const started = Date.now();
      if (!model.trim()) return { available: false, error: 'Code API vide.' };

      try {
        const data = await call({
          model: model.trim(),
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
        });
        const sample = String(data?.choices?.[0]?.message?.content ?? '').replace(/\s+/g, ' ').trim();
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
