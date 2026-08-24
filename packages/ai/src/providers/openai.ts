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
import { avecUneReprise, ErreurFournisseur, STATUTS_PASSAGERS } from '../port';
import type { AIProvider, ChatRequest, ChatResult, ProviderConfig, TestResult } from '../port';
import { stripCodeFences } from '../port';

const DEFAULT_BASE = 'https://api.openai.com/v1';

/**
 * Budget de la sonde (SPEC §5.4 : « au coût le plus bas »).
 *
 * Il valait 5 jetons, ce qui suffit pour un modèle ordinaire et ne suffit pas
 * pour un modèle à raisonnement : sa réflexion se paie sur le même budget, et
 * plusieurs fournisseurs refusent la requête plutôt que de rendre une réponse
 * tronquée. 64 jetons restent une fraction de centime et laissent la place au
 * « pong ».
 */
export const PROBE_MAX_TOKENS = 64;

/**
 * Le message d'erreur d'une API compatible OpenAI, en entier.
 *
 * Les passerelles empilent deux niveaux : le leur (« Provider returned
 * error ») et celui du fournisseur en dessous, dans `metadata.raw`. Ne
 * remonter que le premier, c'est afficher « il y a eu une erreur » — le
 * diagnostic est dans le second, et sans lui on cherche du mauvais côté.
 */
export const describeError = (data: any, status: number): string => {
  const error = data?.error ?? {};
  const message = typeof error.message === 'string' ? error.message.trim() : '';
  const entete = message || `Erreur ${status}`;

  const details: string[] = [];
  const fournisseur = error.metadata?.provider_name;
  if (typeof fournisseur === 'string' && fournisseur.trim()) {
    details.push(`fournisseur : ${fournisseur.trim()}`);
  }

  const brut = error.metadata?.raw;
  if (brut) {
    const texte = (typeof brut === 'string' ? brut : JSON.stringify(brut)).trim();
    // On ne répète pas le message quand la passerelle l'a simplement recopié.
    if (texte && !entete.includes(texte)) details.push(texte.slice(0, 300));
  }

  const code = error.code ?? status;
  if (code && String(code) !== '200') details.push(`code ${code}`);

  return details.length > 0 ? `${entete} (${details.join(' — ')})` : entete;
};

export const createOpenAIProvider = (config: ProviderConfig, id = 'openai'): AIProvider => {
  const unAppel = async (payload: unknown): Promise<any> => {
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
      // Du HTML de passerelle plutôt que du JSON : c'est l'infrastructure qui
      // parle, pas le modèle. Une seconde tentative a du sens.
      throw new ErreurFournisseur(
        `${id} a renvoyé une réponse invalide (${res.status}) : ${text.slice(0, 160)}`,
        STATUTS_PASSAGERS.has(res.status),
      );
    }
    if (!res.ok) {
      throw new ErreurFournisseur(`${id} : ${describeError(data, res.status)}`, STATUTS_PASSAGERS.has(res.status));
    }
    return data;
  };

  const call = (payload: unknown): Promise<any> =>
    avecUneReprise(() => unAppel(payload), config.repriseDelaiMs);

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
          max_tokens: PROBE_MAX_TOKENS,
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
