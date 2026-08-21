/**
 * L'abstraction tient-elle ?
 *
 * Le vrai test d'un port est qu'un second adaptateur puisse l'implémenter sans
 * le déformer. Ces tests exercent donc les DEUX fournisseurs sur le même
 * contrat, et vérifient séparément les contorsions propres à 1min.ai — dont
 * l'existence même justifie l'abstraction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getProvider, PROVIDER_IDS, flattenConversation, extractText, findBusinessError,
  createOneMinProvider, createOpenAIProvider, createOpenRouterProvider, OPENROUTER_BASE_URL,
  stripCodeFences, type ChatMessage,
} from '../src/index';

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

beforeEach(() => vi.unstubAllGlobals());

describe('registre', () => {
  it('expose les trois fournisseurs', () => {
    expect(PROVIDER_IDS.sort()).toEqual(['onemin', 'openai', 'openrouter']);
  });

  it('refuse un fournisseur inconnu au lieu de retomber sur un autre', () => {
    // Un repli silencieux facturerait le mauvais compte sans prévenir.
    expect(() => getProvider('mistral', CONFIG)).toThrow(/Fournisseur inconnu/);
  });
});

describe('même contrat, deux fournisseurs', () => {
  it.each([
    ['onemin', ONEMIN_OK],
    ['openai', OPENAI_OK],
    ['openrouter', OPENAI_OK],
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
  ])('%s teste un modèle et mesure sa latence', async (id, payload) => {
    stubFetch(payload);
    const res = await getProvider(id, CONFIG).test('un-modele');
    expect(res.available).toBe(true);
    expect(res.sample).toContain('La réponse');
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it.each(['onemin', 'openai'])('%s signale un code vide sans appeler le réseau', async (id) => {
    const calls = stubFetch({});
    const res = await getProvider(id, CONFIG).test('   ');
    expect(res.available).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['onemin', { error: 'Modèle inconnu' }],
    ['openai', { error: { message: 'Modèle inconnu' } }],
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

describe('nettoyage des clôtures markdown', () => {
  it('retire les fences autour du JSON', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
});
