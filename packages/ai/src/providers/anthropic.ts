/**
 * Adaptateur pour l'API Messages d'Anthropic — Claude en direct.
 *
 * Claude était déjà joignable par OpenRouter. Le joindre en direct a une
 * raison précise : l'offre Max comprend des crédits mensuels pour l'API, qui ne
 * servent qu'aux appels faits avec une clé de l'organisation Console liée à
 * l'abonnement. Passer par OpenRouter les laisserait dormir.
 *
 * `fetch` nu, comme les autres adaptateurs, et non le SDK officiel : ce
 * package ne dépend que de `shared` (SPEC §1.1), et le SDK rejoue lui-même
 * deux fois un appel qui échoue, là où le produit n'en admet qu'une (§5.2).
 *
 * Trois écarts avec l'API OpenAI, que l'appelant ne voit pas :
 * - `max_tokens` est obligatoire ;
 * - un tour vide est refusé, là où le schéma de l'application l'admet ;
 * - la sortie JSON stricte exige un schéma, que le port ne porte pas : `json`
 *   s'en remet à la consigne du prompt, comme chez 1min.ai.
 */
import { avecUneReprise, ErreurFournisseur, STATUTS_PASSAGERS, nombreOuNull, stripCodeFences, USAGE_INCONNU } from '../port';
import type { AIProvider, ChatRequest, ChatResult, ProviderConfig, TestResult, UsageIA } from '../port';
import { PROBE_MAX_TOKENS } from './openai';

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';

/** La version de l'API, datée : elle ne change que quand on la change ici. */
export const ANTHROPIC_VERSION = '2026-10-21';

/**
 * Le plafond de la réponse, réflexion comprise : les modèles récents
 * réfléchissent avant d'écrire, et cette réflexion se paie sur le même budget.
 * Un article long et sa réflexion tiennent largement dans 32 000 jetons ; on
 * ne paie que ce qui est produit, le plafond ne coûte rien.
 */
export const ANTHROPIC_MAX_TOKENS = 32_000;

/** `{ type: 'error', error: { type, message } }` — le message seul, et sa nature quand elle aide. */
export const decrireErreurAnthropic = (data: any, status: number): string => {
  const message = typeof data?.error?.message === 'string' ? data.error.message.trim() : '';
  const nature = typeof data?.error?.type === 'string' ? data.error.type : null;
  const details = [nature, `code ${status}`].filter(Boolean).join(', ');
  return `${message || `Erreur ${status}`} (${details})`;
};

/**
 * Les jetons reçus et produits ; jamais de prix. Anthropic ne chiffre pas la
 * requête dans sa réponse, et le produit ne recalcule pas un prix à partir des
 * jetons (SPEC §2.6) : `coutUsd` reste inconnu.
 *
 * Les jetons lus ou écrits en cache sont des jetons reçus : ils s'ajoutent.
 */
export const lireUsageAnthropic = (data: any): UsageIA => {
  const usage = data?.usage;
  if (!usage) return USAGE_INCONNU;
  const entree = nombreOuNull(usage.input_tokens);
  return {
    entree: entree === null ? null
      : entree + (nombreOuNull(usage.cache_creation_input_tokens) ?? 0) + (nombreOuNull(usage.cache_read_input_tokens) ?? 0),
    sortie: nombreOuNull(usage.output_tokens),
    coutUsd: null,
  };
};

/** Le texte de la réponse : ses blocs `text`, dans l'ordre. Les blocs de réflexion n'en font pas partie. */
const texteDe = (data: any): string =>
  (Array.isArray(data?.content) ? data.content : [])
    .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
    .map((b: any) => b.text)
    .join('');

export const createAnthropicProvider = (config: ProviderConfig): AIProvider => {
  const unAppel = async (payload: unknown): Promise<any> => {
    const res = await fetch(`${config.baseUrl ?? ANTHROPIC_BASE_URL}/messages`, {
      method: 'POST',
      signal: AbortSignal.timeout(config.delaiMaxMs ?? 12 * 60 * 1000),
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ErreurFournisseur(
        `anthropic a renvoyé une réponse invalide (${res.status}) : ${text.slice(0, 160)}`,
        STATUTS_PASSAGERS.has(res.status),
      );
    }
    if (!res.ok) {
      throw new ErreurFournisseur(`anthropic : ${decrireErreurAnthropic(data, res.status)}`, STATUTS_PASSAGERS.has(res.status));
    }
    return data;
  };

  const call = (payload: unknown): Promise<any> =>
    avecUneReprise(() => unAppel(payload), config.repriseDelaiMs);

  return {
    id: 'anthropic',

    async chat(req: ChatRequest): Promise<ChatResult> {
      const data = await call({
        model: req.model,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        ...(req.system ? { system: req.system } : {}),
        // Le schéma de l'application admet un tour vide pourvu qu'un autre porte
        // du contenu ; l'API Messages le refuse. On l'écarte ici, sans rien changer d'autre.
        messages: req.messages.filter((m) => m.content.trim().length > 0),
      });

      // Deux arrêts qui laisseraient passer un texte faux pour un texte entier :
      // ils se disent, et ne se rejouent pas — la même demande s'arrêterait au même endroit.
      if (data?.stop_reason === 'refusal') {
        const categorie = data?.stop_details?.category;
        const explication = typeof data?.stop_details?.explanation === 'string' ? ` ${data.stop_details.explanation}` : '';
        throw new ErreurFournisseur(`anthropic : Claude a décliné la demande${categorie ? ` (${categorie})` : ''}.${explication}`, false);
      }
      if (data?.stop_reason === 'max_tokens') {
        throw new ErreurFournisseur(
          `anthropic : réponse tronquée — le plafond de ${ANTHROPIC_MAX_TOKENS} jetons, réflexion comprise, est atteint.`, false);
      }
      return { text: stripCodeFences(texteDe(data)), usage: lireUsageAnthropic(data), raw: data };
    },

    async test(model: string): Promise<TestResult> {
      const started = Date.now();
      if (!model.trim()) return { available: false, error: 'Code API vide.' };

      try {
        const data = await call({
          model: model.trim(),
          max_tokens: PROBE_MAX_TOKENS,
          messages: [{ role: 'user', content: 'ping' }],
        });
        const sample = texteDe(data).replace(/\s+/g, ' ').trim();
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
