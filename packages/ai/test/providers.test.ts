/**
 * L'abstraction tient-elle ?
 *
 * Le vrai test d'un port est qu'un second adaptateur puisse l'implémenter sans
 * le déformer. Ces tests exercent donc les DEUX fournisseurs sur le même
 * contrat, et vérifient séparément les contorsions propres à 1min.ai — dont
 * l'existence même justifie l'abstraction.
 */
import { lireUsage } from '../src/providers/openai';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getProvider, PROVIDER_IDS, flattenConversation, extractText, findBusinessError,
  createOneMinProvider, createOpenAIProvider, createOpenRouterProvider, OPENROUTER_BASE_URL,
  createAnthropicProvider, ANTHROPIC_BASE_URL, ANTHROPIC_VERSION, ANTHROPIC_MAX_TOKENS,
  describeError, PROBE_MAX_TOKENS, stripCodeFences, type ChatMessage,
} from '../src/index';
import { lireUsageAnthropic } from '../src/providers/anthropic';

const CONFIG = { apiKey: 'cle-de-test' };

const CONVERSATION: ChatMessage[] = [
  { role: 'user', content: 'Première question' },
  { role: 'assistant', content: 'Première réponse' },
  { role: 'user', content: 'Deuxième question' },
];

/** Capture la requête sortante et renvoie la charge voulue. */
const stubFetch = (payload: unknown, status = 200) => {
  const calls: Array<{ url: string; body: any; headers: any }> = [];
  vi.stubGlobal('fetch', async (url: string, init: any) => {
    calls.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
    return new Response(JSON.stringify(payload), { status });
  });
  return calls;
};

const ONEMIN_OK = { aiRecord: { aiRecordDetail: { resultObject: ['La réponse du modèle'] } } };
const OPENAI_OK = { choices: [{ message: { content: 'La réponse du modèle' } }] };
/** Un modèle récent réfléchit d'abord : un bloc de réflexion, vide par défaut, précède le texte. */
const ANTHROPIC_OK = {
  content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: 'La réponse du modèle' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 120, output_tokens: 45, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
};

beforeEach(() => vi.unstubAllGlobals());

describe('registre', () => {
  it('expose les quatre fournisseurs', () => {
    expect(PROVIDER_IDS.sort()).toEqual(['anthropic', 'onemin', 'openai', 'openrouter']);
  });

  it('refuse un fournisseur inconnu au lieu de retomber sur un autre', () => {
    // Un repli silencieux facturerait le mauvais compte sans prévenir.
    expect(() => getProvider('mistral', CONFIG)).toThrow(/Fournisseur inconnu/);
  });
});

describe('même contrat, quatre fournisseurs', () => {
  it.each([
    ['onemin', ONEMIN_OK],
    ['openai', OPENAI_OK],
    ['openrouter', OPENAI_OK],
    ['anthropic', ANTHROPIC_OK],
  ])('%s renvoie le texte du modèle', async (id, payload) => {
    stubFetch(payload);
    const result = await getProvider(id, CONFIG).chat({
      model: 'un-modele', system: 'Tu es le Coach.', messages: CONVERSATION,
    });
    expect(result.text).toBe('La réponse du modèle');
  });

  it.each([
    ['onemin', ONEMIN_OK],
    ['openai', OPENAI_OK],
    ['openrouter', OPENAI_OK],
    ['anthropic', ANTHROPIC_OK],
  ])('%s teste un modèle et mesure sa latence', async (id, payload) => {
    stubFetch(payload);
    const res = await getProvider(id, CONFIG).test('un-modele');
    expect(res.available).toBe(true);
    expect(res.sample).toContain('La réponse');
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it.each(['onemin', 'openai', 'anthropic'])('%s signale un code vide sans appeler le réseau', async (id) => {
    const calls = stubFetch({});
    const res = await getProvider(id, CONFIG).test('   ');
    expect(res.available).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['onemin', { error: 'Modèle inconnu' }],
    ['openai', { error: { message: 'Modèle inconnu' } }],
    ['anthropic', { type: 'error', error: { type: 'not_found_error', message: 'Modèle inconnu' } }],
  ])('%s remonte l’erreur du fournisseur sans lever', async (id, payload) => {
    stubFetch(payload, 400);
    const res = await getProvider(id, CONFIG).test('modele-fantome');
    expect(res.available).toBe(false);
    expect(res.error).toContain('Modèle inconnu');
  });
});

describe('les contorsions de 1min.ai restent dans son adaptateur', () => {
  it('aplatit la conversation : l’API n’accepte qu’un prompt unique', () => {
    const prompt = flattenConversation('SYSTÈME', CONVERSATION);
    expect(prompt).toContain('SYSTÈME');
    expect(prompt).toContain('HISTORIQUE DE LA CONVERSATION');
    expect(prompt).toContain('Première question');
    expect(prompt).toContain('Première réponse');
    // Le dernier message est présenté comme le message courant, pas l'historique
    expect(prompt.indexOf('Deuxième question')).toBeGreaterThan(prompt.indexOf('Première réponse'));
  });

  it('n’ajoute pas d’historique quand il n’y a qu’un message', () => {
    const prompt = flattenConversation(undefined, [{ role: 'user', content: 'Seule' }]);
    expect(prompt).toBe('Seule');
  });

  it('envoie bien un prompt unique, jamais un tableau de messages', async () => {
    const calls = stubFetch(ONEMIN_OK);
    await createOneMinProvider(CONFIG).chat({ model: 'm', messages: CONVERSATION });
    expect(typeof calls[0].body.promptObject.prompt).toBe('string');
    expect(calls[0].body.messages).toBeUndefined();
    expect(calls[0].headers['API-KEY']).toBe('cle-de-test');
  });

  it.each([
    ['resultObject', { aiRecord: { aiRecordDetail: { resultObject: ['A'] } } }, 'A'],
    ['response', { response: 'B' }, 'B'],
    ['text', { text: 'C' }, 'C'],
    ['output', { output: 'D' }, 'D'],
    ['aiRecord.response', { aiRecord: { response: 'E' } }, 'E'],
  ])('extrait la réponse depuis la forme « %s »', (_, payload, expected) => {
    expect(extractText(payload)).toBe(expected);
  });

  /**
   * Le 21/08/2026 : compte à sec, réponse 200, texte vide, et l'application qui
   * annonçait « réponse IA vide ou invalide ». Le diagnostic partait vers le
   * parseur pour un problème de facturation.
   */
  describe('un refus métier arrive en 200 — il doit quand même se voir', () => {
    const CREDITS_EPUISES = {
      aiRecord: {
        status: 'FAILURE',
        aiRecordDetail: {
          resultObject: {
            code: 'INSUFFICIENT_CREDITS',
            name: 'BusinessError',
            message: 'The feature requires 5655 credits, but the Luminose team only has 0 credits',
          },
        },
      },
    };

    it('lève au lieu de rendre un texte vide', async () => {
      stubFetch(CREDITS_EPUISES);
      await expect(
        createOneMinProvider(CONFIG).chat({ model: 'm', messages: CONVERSATION })
      ).rejects.toThrow(/credits/i);
    });

    it('le testeur de modèle le rapporte au lieu d’annoncer « disponible »', async () => {
      stubFetch(CREDITS_EPUISES);
      const res = await createOneMinProvider(CONFIG).test('m');
      expect(res.available).toBe(false);
      expect(res.error).toContain('credits');
    });

    it('ne se déclenche pas sur une réponse normale', () => {
      expect(findBusinessError(ONEMIN_OK)).toBeNull();
      expect(findBusinessError({ response: 'B' })).toBeNull();
    });

    it('signale un échec même sans message exploitable', () => {
      expect(findBusinessError({ aiRecord: { status: 'FAILURE' } })).toContain('refusée');
    });
  });

  it('signale une réponse non-JSON au lieu de la laisser casser plus haut', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }));
    const res = await createOneMinProvider(CONFIG).test('m');
    expect(res.error).toContain('réponse invalide');
  });
});

/**
 * La preuve que le port tient : un troisième fournisseur n'ajoute qu'une URL.
 * Si OpenRouter avait demandé une contorsion, c'est ici qu'on l'aurait vu.
 */
describe('openrouter n’est qu’une URL de base', () => {
  it('vise openrouter.ai, pas openai.com', async () => {
    const calls = stubFetch(OPENAI_OK);
    await createOpenRouterProvider(CONFIG).chat({ model: 'anthropic/claude-sonnet-4.5', messages: CONVERSATION });
    expect(calls[0].url.startsWith(OPENROUTER_BASE_URL)).toBe(true);
    expect(calls[0].headers.Authorization).toBe('Bearer cle-de-test');
  });

  it('accepte un code modèle préfixé par son éditeur', async () => {
    const calls = stubFetch(OPENAI_OK);
    await getProvider('openrouter', CONFIG).chat({ model: 'openai/gpt-5.2-pro', messages: CONVERSATION });
    expect(calls[0].body.model).toBe('openai/gpt-5.2-pro');
  });

  it('se laisse pointer ailleurs — une passerelle compatible reste joignable', async () => {
    const calls = stubFetch(OPENAI_OK);
    await createOpenRouterProvider({ ...CONFIG, baseUrl: 'https://passerelle.test/v1' }).chat({
      model: 'm', messages: CONVERSATION,
    });
    expect(calls[0].url).toBe('https://passerelle.test/v1/chat/completions');
  });

  it('porte son propre identifiant — la provenance ne se confond pas', () => {
    expect(createOpenRouterProvider(CONFIG).id).toBe('openrouter');
    expect(createOpenAIProvider(CONFIG).id).toBe('openai');
  });
});

/**
 * Le 21/08/2026 : un test de modèle sur OpenRouter rendait « Provider returned
 * error », point. La passerelle empile pourtant deux niveaux — le sien et
 * celui du fournisseur en dessous. Sans le second, on cherche du mauvais côté.
 */
describe('une erreur de passerelle se lit en entier', () => {
  const ERREUR_OPENROUTER = {
    error: {
      message: 'Provider returned error',
      code: 429,
      metadata: { provider_name: 'Chutes', raw: 'rate limit exceeded for free tier' },
    },
  };

  it('remonte le fournisseur et son message brut', () => {
    const texte = describeError(ERREUR_OPENROUTER, 429);
    expect(texte).toContain('Provider returned error');
    expect(texte).toContain('Chutes');
    expect(texte).toContain('rate limit exceeded');
    expect(texte).toContain('429');
  });

  it('se contente du message quand la passerelle n’en dit pas plus', () => {
    expect(describeError({ error: { message: 'Invalid model' } }, 400)).toBe('Invalid model (code 400)');
  });

  it('ne répète pas un message que la passerelle a recopié', () => {
    const texte = describeError({ error: { message: 'Rate limited', metadata: { raw: 'Rate limited' } } }, 429);
    expect(texte.match(/Rate limited/g)).toHaveLength(1);
  });

  it('dit quelque chose même sans corps d’erreur exploitable', () => {
    expect(describeError({}, 502)).toContain('502');
    expect(describeError(null, 500)).toContain('500');
  });

  it('le testeur de modèle rapporte cette erreur complète', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(ERREUR_OPENROUTER), { status: 429 }));
    const res = await createOpenRouterProvider(CONFIG).test('z-ai/glm-5.2:free');
    expect(res.available).toBe(false);
    expect(res.error).toContain('Chutes');
    expect(res.error).toContain('rate limit exceeded');
  });

  /**
   * La sonde valait 5 jetons : un modèle à raisonnement paie sa réflexion sur
   * ce budget, et plusieurs fournisseurs refusent plutôt que de tronquer.
   */
  it('sonde avec un budget qui laisse la place à un modèle qui réfléchit', async () => {
    const calls = stubFetch(OPENAI_OK);
    await createOpenRouterProvider(CONFIG).test('z-ai/glm-5.2:free');
    expect(calls[0].body.max_tokens).toBe(PROBE_MAX_TOKENS);
    expect(PROBE_MAX_TOKENS).toBeGreaterThan(5);
  });
});

describe('openai utilise le format natif', () => {
  it('envoie un vrai tableau de messages, avec un rôle système', async () => {
    const calls = stubFetch(OPENAI_OK);
    await createOpenAIProvider(CONFIG).chat({ model: 'm', system: 'SYS', messages: CONVERSATION });
    const sent = calls[0].body.messages;
    expect(sent[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(sent).toHaveLength(4);
    expect(calls[0].headers.Authorization).toBe('Bearer cle-de-test');
  });

  it('active le mode JSON natif quand on le demande', async () => {
    const calls = stubFetch(OPENAI_OK);
    await createOpenAIProvider(CONFIG).chat({ model: 'm', messages: CONVERSATION, json: true });
    expect(calls[0].body.response_format).toEqual({ type: 'json_object' });
  });

  it('accepte une URL de base — Groq, Together, OpenRouter…', async () => {
    const calls = stubFetch(OPENAI_OK);
    await createOpenAIProvider({ apiKey: 'k', baseUrl: 'https://api.groq.com/openai/v1' }, 'groq')
      .chat({ model: 'm', messages: CONVERSATION });
    expect(calls[0].url).toBe('https://api.groq.com/openai/v1/chat/completions');
  });
});

describe('anthropic : l’API Messages, en direct', () => {
  it('vise api.anthropic.com avec la clé, la version datée, et le plafond obligatoire', async () => {
    const calls = stubFetch(ANTHROPIC_OK);
    await createAnthropicProvider(CONFIG).chat({ model: 'claude-opus-5-5', system: 'Tu es le Coach.', messages: CONVERSATION });
    expect(calls[0].url).toBe(`${ANTHROPIC_BASE_URL}/messages`);
    expect(calls[0].headers).toMatchObject({ 'x-api-key': 'cle-de-test', 'anthropic-version': ANTHROPIC_VERSION });
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(calls[0].body).toEqual({
      model: 'claude-opus-5-5', max_tokens: ANTHROPIC_MAX_TOKENS, system: 'Tu es le Coach.', messages: CONVERSATION,
    });
  });

  it('le système est un champ à part, jamais un message ; absent, il n’est pas envoyé', async () => {
    const calls = stubFetch(ANTHROPIC_OK);
    await createAnthropicProvider(CONFIG).chat({ model: 'claude-opus-5-5', messages: CONVERSATION });
    expect(calls[0].body).not.toHaveProperty('system');
    expect(calls[0].body.messages.every((m: any) => m.role !== 'system')).toBe(true);
  });

  it('écarte un tour vide, que l’application admet et que l’API refuse', async () => {
    const calls = stubFetch(ANTHROPIC_OK);
    await createAnthropicProvider(CONFIG).chat({
      model: 'claude-opus-5-5',
      messages: [{ role: 'user', content: 'Le brouillon : …' }, { role: 'assistant', content: '  ' }, { role: 'user', content: 'Applique l’ajustement demandé.' }],
    });
    expect(calls[0].body.messages).toEqual([
      { role: 'user', content: 'Le brouillon : …' }, { role: 'user', content: 'Applique l’ajustement demandé.' },
    ]);
  });

  it('le mode JSON s’en remet au prompt : aucun champ inconnu, les clôtures retirées', async () => {
    const calls = stubFetch({ ...ANTHROPIC_OK, content: [{ type: 'text', text: '```json\n{"verdict":"ok"}\n```' }] });
    const res = await createAnthropicProvider(CONFIG).chat({ model: 'claude-opus-5-5', messages: CONVERSATION, json: true });
    expect(Object.keys(calls[0].body).sort()).toEqual(['max_tokens', 'messages', 'model']);
    expect(res.text).toBe('{"verdict":"ok"}');
  });

  it('rend le texte seul : la réflexion n’en fait pas partie, plusieurs blocs se recollent', async () => {
    stubFetch({ ...ANTHROPIC_OK, content: [
      { type: 'thinking', thinking: 'Je pèse les deux angles.', signature: 's' },
      { type: 'text', text: 'Première partie, ' }, { type: 'text', text: 'seconde partie.' },
    ] });
    const res = await createAnthropicProvider(CONFIG).chat({ model: 'claude-opus-5-5', messages: CONVERSATION });
    expect(res.text).toBe('Première partie, seconde partie.');
  });

  it('un refus de Claude se dit, avec sa catégorie, et ne se rejoue pas', async () => {
    const calls = stubFetch({ content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'bio', explanation: 'Raison donnée.' } });
    await expect(createAnthropicProvider({ ...CONFIG, repriseDelaiMs: 0 }).chat({ model: 'claude-opus-5-5', messages: CONVERSATION }))
      .rejects.toThrow('anthropic : Claude a décliné la demande (bio). Raison donnée.');
    expect(calls).toHaveLength(1);
  });

  it('une réponse tronquée au plafond ne passe pas pour une réponse entière', async () => {
    stubFetch({ ...ANTHROPIC_OK, stop_reason: 'max_tokens' });
    await expect(createAnthropicProvider(CONFIG).chat({ model: 'claude-opus-5-5', messages: CONVERSATION }))
      .rejects.toThrow(/réponse tronquée — le plafond de 32000 jetons, réflexion comprise, est atteint/);
  });

  it('une erreur de l’API se lit avec sa nature et son code — les crédits épuisés compris', async () => {
    stubFetch({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }, 400);
    await expect(createAnthropicProvider(CONFIG).chat({ model: 'claude-opus-5-5', messages: CONVERSATION }))
      .rejects.toThrow('anthropic : Your credit balance is too low to access the Anthropic API. (invalid_request_error, code 400)');
  });

  it('reprend une fois sur un 529 — l’encombrement d’Anthropic passe', async () => {
    let n = 0;
    vi.stubGlobal('fetch', async () => {
      n += 1;
      return n === 1
        ? new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }), { status: 529 })
        : new Response(JSON.stringify(ANTHROPIC_OK), { status: 200 });
    });
    const res = await createAnthropicProvider({ ...CONFIG, repriseDelaiMs: 0 }).chat({ model: 'claude-opus-5-5', messages: CONVERSATION });
    expect(res.text).toBe('La réponse du modèle');
    expect(n).toBe(2);
  });

  it('sonde avec le même petit budget que les autres', async () => {
    const calls = stubFetch(ANTHROPIC_OK);
    await createAnthropicProvider(CONFIG).test('claude-haiku-5-5');
    expect(calls[0].body).toEqual({ model: 'claude-haiku-5-5', max_tokens: PROBE_MAX_TOKENS, messages: [{ role: 'user', content: 'ping' }] });
  });

  it('se laisse pointer ailleurs', async () => {
    const calls = stubFetch(ANTHROPIC_OK);
    await createAnthropicProvider({ ...CONFIG, baseUrl: 'https://passerelle.exemple/v1' }).chat({ model: 'claude-opus-5-5', messages: CONVERSATION });
    expect(calls[0].url).toBe('https://passerelle.exemple/v1/messages');
  });
});

describe('ce qu’un appel à Anthropic a coûté', () => {
  it('des jetons, jamais de prix : Anthropic n’en déclare pas, et on ne le recalcule pas', () => {
    expect(lireUsageAnthropic(ANTHROPIC_OK)).toEqual({ entree: 120, sortie: 45, coutUsd: null });
  });

  it('les jetons servis par le cache sont des jetons reçus', () => {
    expect(lireUsageAnthropic({ usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 } }))
      .toEqual({ entree: 1110, sortie: 5, coutUsd: null });
  });

  it('sans bloc usage, on ne sait rien', () => {
    expect(lireUsageAnthropic({})).toEqual({ entree: null, sortie: null, coutUsd: null });
  });

  it('sans jetons d’entrée déclarés, le cache seul ne fait pas un total', () => {
    expect(lireUsageAnthropic({ usage: { output_tokens: 5, cache_read_input_tokens: 1000 } })).toEqual({ entree: null, sortie: 5, coutUsd: null });
  });
});

describe('nettoyage des clôtures markdown', () => {
  it('retire les fences autour du JSON', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
});

/**
 * La reprise sur échec passager.
 *
 * Née d'un « Go Éditeur » qui a échoué puis fonctionné à l'identique la fois
 * suivante. Ce qui compte ici : reprendre sur ce qui passe, et JAMAIS sur un
 * refus motivé — réessayer un 401 ne fait que retarder un message déjà clair.
 */
describe('reprise sur échec passager', () => {
  const SANS_ATTENTE = { apiKey: 'cle-de-test', repriseDelaiMs: 0 };

  /** Sert les réponses dans l'ordre, une par appel. */
  const stubSequence = (reponses: Array<{ status?: number; payload?: unknown; jette?: boolean; texte?: string }>) => {
    const appels: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      const r = reponses[appels.length] ?? reponses[reponses.length - 1];
      appels.push(String(url));
      if (r.jette) throw new TypeError('Network connection lost');
      if (r.texte !== undefined) return new Response(r.texte, { status: r.status ?? 200 });
      return new Response(JSON.stringify(r.payload ?? OPENAI_OK), { status: r.status ?? 200 });
    });
    return appels;
  };

  it('reprend une fois sur un 503 et rend la réponse', async () => {
    const appels = stubSequence([
      { status: 503, payload: { error: { message: 'temporairement indisponible' } } },
      { status: 200, payload: OPENAI_OK },
    ]);
    const res = await createOpenAIProvider(SANS_ATTENTE).chat({ model: 'gpt-5.6-sol', messages: CONVERSATION });

    expect(res.text).toBe('La réponse du modèle');
    expect(appels).toHaveLength(2);
  });

  it('reprend sur un 429 — l’encombrement passe', async () => {
    const appels = stubSequence([{ status: 429, payload: { error: { message: 'rate limited' } } }, {}]);
    await createOpenAIProvider(SANS_ATTENTE).chat({ model: 'm', messages: CONVERSATION });
    expect(appels).toHaveLength(2);
  });

  it('reprend quand le transport lâche, sans réponse du tout', async () => {
    const appels = stubSequence([{ jette: true }, { status: 200, payload: OPENAI_OK }]);
    const res = await createOpenAIProvider(SANS_ATTENTE).chat({ model: 'm', messages: CONVERSATION });

    expect(res.text).toBe('La réponse du modèle');
    expect(appels).toHaveLength(2);
  });

  /** Le point qui distingue une reprise utile d'un simple doublement du coût. */
  it('ne reprend JAMAIS un refus motivé', async () => {
    for (const status of [401, 402, 404, 422]) {
      const appels = stubSequence([{ status, payload: { error: { message: 'refus' } } }, {}]);
      await expect(
        createOpenAIProvider(SANS_ATTENTE).chat({ model: 'm', messages: CONVERSATION })
      ).rejects.toThrow();
      expect(appels).toHaveLength(1);
    }
  });

  it('deux échecs passagers restent un échec, avec le message du fournisseur', async () => {
    const appels = stubSequence([
      { status: 502, payload: { error: { message: 'passerelle en vrac' } } },
      { status: 502, payload: { error: { message: 'passerelle en vrac' } } },
    ]);
    await expect(
      createOpenAIProvider(SANS_ATTENTE).chat({ model: 'm', messages: CONVERSATION })
    ).rejects.toThrow(/passerelle en vrac/);
    expect(appels).toHaveLength(2);
  });

  it('du HTML de passerelle vaut une reprise, pas un abandon', async () => {
    const appels = stubSequence([
      { status: 502, texte: '<html><body>Bad Gateway</body></html>' },
      { status: 200, payload: OPENAI_OK },
    ]);
    const res = await createOpenAIProvider(SANS_ATTENTE).chat({ model: 'm', messages: CONVERSATION });

    expect(res.text).toBe('La réponse du modèle');
    expect(appels).toHaveLength(2);
  });

  it('1min.ai en profite aussi', async () => {
    const appels = stubSequence([
      { status: 503, payload: { error: 'service indisponible' } },
      { status: 200, payload: ONEMIN_OK },
    ]);
    const res = await createOneMinProvider(SANS_ATTENTE).chat({ model: 'claude-fable-5', messages: CONVERSATION });

    expect(res.text).toBe('La réponse du modèle');
    expect(appels).toHaveLength(2);
  });

  /** Un refus métier n'est pas un code HTTP : il arrive dans un 200. */
  it('un refus métier de 1min.ai n’est pas rejoué', async () => {
    const appels = stubSequence([{
      status: 200,
      payload: { aiRecord: { status: 'FAILURE', aiRecordDetail: { resultObject: { message: 'INSUFFICIENT_CREDITS' } } } },
    }]);
    await expect(
      createOneMinProvider(SANS_ATTENTE).chat({ model: 'm', messages: CONVERSATION })
    ).rejects.toThrow(/1min\.ai a refusé/);
    expect(appels).toHaveLength(1);
  });
});

/**
 * Le décompte d'un appel (SPEC §2.6).
 *
 * L'invariant : `null` veut dire « le fournisseur n'a rien déclaré », jamais
 * « zéro ». Un adaptateur qui rendrait 0 ferait passer un fournisseur muet pour
 * un fournisseur gratuit, et le total d'un contenu deviendrait faux sans que
 * rien ne le signale.
 */
describe('ce qu’un appel a coûté', () => {
  it('lit les jetons et le prix quand le fournisseur les donne', () => {
    expect(lireUsage({ usage: { prompt_tokens: 1200, completion_tokens: 340, cost: 0.0142 } }))
      .toEqual({ entree: 1200, sortie: 340, coutUsd: 0.0142 });
  });

  it('accepte la forme input/output des API Responses', () => {
    expect(lireUsage({ usage: { input_tokens: 10, output_tokens: 4 } }))
      .toEqual({ entree: 10, sortie: 4, coutUsd: null });
  });

  it('sans bloc usage, on ne sait RIEN — et on ne dit pas zéro', () => {
    expect(lireUsage({})).toEqual({ entree: null, sortie: null, coutUsd: null });
    expect(lireUsage({ usage: null })).toEqual({ entree: null, sortie: null, coutUsd: null });
  });

  it('des jetons sans prix restent des jetons sans prix', () => {
    expect(lireUsage({ usage: { prompt_tokens: 50, completion_tokens: 5 } }))
      .toEqual({ entree: 50, sortie: 5, coutUsd: null });
  });

  it('une valeur qui n’est pas un nombre vaut inconnu', () => {
    expect(lireUsage({ usage: { prompt_tokens: 'beaucoup', cost: NaN } }))
      .toEqual({ entree: null, sortie: null, coutUsd: null });
  });

  it('zéro déclaré reste zéro : un appel gratuit existe', () => {
    expect(lireUsage({ usage: { prompt_tokens: 0, completion_tokens: 0, cost: 0 } }))
      .toEqual({ entree: 0, sortie: 0, coutUsd: 0 });
  });
});

it.each([createOpenAIProvider, createOneMinProvider, createAnthropicProvider])('borne une attente réseau sans doubler un appel expiré', async (creer) => {
  const appel = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const signal = init.signal!;
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  vi.stubGlobal('fetch', appel);
  const fournisseur = creer({ apiKey: 'test', delaiMaxMs: 5, repriseDelaiMs: 0 });
  await expect(fournisseur.chat({ model: 'modele-test', messages: [{ role: 'user', content: 'Bonjour' }] })).rejects.toThrow('délai maximal');
  expect(appel).toHaveBeenCalledTimes(1);
});
