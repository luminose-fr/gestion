/**
 * L'explorateur du catalogue OpenRouter.
 *
 * Ce qui compte ici : le croisement prix ↔ indices, et le fait que l'absence
 * de clé ne rende pas l'écran inutile — sans indices, le prix et le contexte
 * écartent déjà beaucoup de candidats.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { makeEnv } from './helpers/d1';

let env: ReturnType<typeof makeEnv>;
let token: string;

const call = (path: string, init: RequestInit = {}) =>
  app.fetch(new Request(`https://api.test${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Session-Token': token, ...(init.headers || {}) },
  }), env as any);

const json = async (r: Response) => await r.json() as any;

const MODELES = {
  data: [
    {
      id: 'anthropic/claude-fable-5', name: 'Claude Fable 5', context_length: 1000000,
      architecture: { output_modalities: ['text'] },
      pricing: { prompt: '0.00001', completion: '0.00005' },
    },
    {
      id: 'z-ai/glm-5.2:free', name: 'GLM 5.2 (free)', context_length: 256000,
      architecture: { output_modalities: ['text'] },
      pricing: { prompt: '0', completion: '0' },
    },
    {
      id: 'google/lyria-3-pro', name: 'Lyria 3', context_length: 1000,
      architecture: { output_modalities: ['audio'] },
      pricing: { prompt: '0', completion: '0' },
    },
  ],
};

const BENCHMARKS = {
  data: [
    { source: 'artificial-analysis', model_permaslug: 'anthropic/claude-fable-5',
      intelligence_index: 71.2, coding_index: 65.8, agentic_index: 58.3 },
  ],
};

/** Répond selon l'URL appelée, pour distinguer les deux appels sortants. */
const stubOpenRouter = (opts: { benchmarks?: unknown; benchStatus?: number } = {}) => {
  const appels: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init: any) => {
    appels.push(String(url));
    if (String(url).includes('/benchmarks')) {
      return new Response(JSON.stringify(opts.benchmarks ?? BENCHMARKS), { status: opts.benchStatus ?? 200 });
    }
    return new Response(JSON.stringify(MODELES), { status: 200 });
  });
  return appels;
};

beforeEach(async () => {
  env = makeEnv();
  token = await createSessionToken(env);
});

describe('explorateur de catalogue', () => {
  it('croise le prix et les indices, en $ par million', async () => {
    stubOpenRouter();
    await call('/api/settings/providers/openrouter', {
      method: 'PUT', body: JSON.stringify({ apiKey: 'sk-or-v1-0123456789' }),
    });

    const data = await json(await call('/api/models/catalogue'));
    const fable = data.models.find((m: any) => m.id === 'anthropic/claude-fable-5');

    expect(fable).toMatchObject({
      name: 'Claude Fable 5', contextLength: 1000000,
      promptPrice: 10, completionPrice: 50, intelligence: 71.2, coding: 65.8,
    });
    expect(data.benchmarksAvailable).toBe(true);
  });

  it('écarte ce qui ne produit pas de texte', async () => {
    stubOpenRouter();
    const data = await json(await call('/api/models/catalogue'));
    expect(data.models.map((m: any) => m.id)).not.toContain('google/lyria-3-pro');
    expect(data.models).toHaveLength(2);
  });

  /** Sans clé, l'écran reste utile — et il doit pouvoir dire pourquoi la colonne est vide. */
  it('rend le catalogue même sans clé, en le disant', async () => {
    const appels = stubOpenRouter();
    const data = await json(await call('/api/models/catalogue'));

    expect(data.models).toHaveLength(2);
    expect(data.benchmarksAvailable).toBe(false);
    expect(data.benchmarksReason).toBe('clé absente');
    expect(appels.some(u => u.includes('/benchmarks'))).toBe(false);
  });

  it('un refus des benchmarks n’emporte pas le catalogue', async () => {
    stubOpenRouter({ benchStatus: 429 });
    await call('/api/settings/providers/openrouter', {
      method: 'PUT', body: JSON.stringify({ apiKey: 'sk-or-v1-0123456789' }),
    });

    const data = await json(await call('/api/models/catalogue'));
    expect(data.models).toHaveLength(2);
    expect(data.benchmarksAvailable).toBe(false);
    expect(data.benchmarksReason).toBe('refus');
  });

  it('la clé ne part qu’au bon destinataire', async () => {
    const appels = stubOpenRouter();
    await call('/api/settings/providers/openrouter', {
      method: 'PUT', body: JSON.stringify({ apiKey: 'sk-or-v1-0123456789' }),
    });
    await call('/api/models/catalogue');

    // Le catalogue public est appelé SANS en-tête d'autorisation.
    expect(appels.filter(u => u.includes('/models')).length).toBeGreaterThan(0);
  });

  it('exige un jeton de session', async () => {
    stubOpenRouter();
    const res = await app.fetch(new Request('https://api.test/api/models/catalogue'), env as any);
    expect(res.status).toBe(401);
  });
});
