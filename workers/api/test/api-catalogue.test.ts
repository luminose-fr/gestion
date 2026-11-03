/**
 * L'explorateur du catalogue OpenRouter.
 *
 * Ce qui compte ici : le croisement prix ↔ indices, et le fait que l'absence
 * de clé ne rende pas l'écran inutile — sans indices, le prix et le contexte
 * écartent déjà beaucoup de candidats.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    {
      id: 'google/gemini-3-pro-image', name: 'Nano Banana Pro', context_length: 65000,
      architecture: { output_modalities: ['image', 'text'] },
      pricing: { prompt: '0.000002', completion: '0.000012' },
    },
  ],
};

const BENCHMARKS = {
  data: [
    { source: 'artificial-analysis', model_permaslug: 'anthropic/claude-fable-5',
      intelligence_index: 71.2, coding_index: 65.8, agentic_index: 58.3 },
  ],
};

/**
 * EQ-Bench sert un CSV enfermé dans un littéral de gabarit, au milieu de son
 * code de graphique. La fixture reproduit cette forme — c'est elle qu'il faut
 * savoir traverser.
 */
const BT = '`';
const CLASSEMENT_ECRITURE = [
  'window.data =', BT,
  'model_name,elo_score,creative_writing_score,avg_length,vocab_complexity,slop_score,repetition_score',
  'claude-fable-5,1932.4,16.81,1200,0.52,10.28,0.11',
  'glm-5.2,1750.1,16.44,1100,0.49,13.10,0.09',
  'gpt-4o-mini,870.3,11.67,900,0.31,44.02,0.40',
  BT, ';',
].join('\n');

const RADAR_ECRITURE = `const chartData = ${JSON.stringify({
  'claude-fable-5': {
    absoluteRadar: { labels: ['Coherent', 'Instruction Following', 'Avoids Purple Prose'], values: [18.14, 18.49, 16.04] },
    strengths: [{ criterion: 'Pacing', relativeScore: 1 }, { criterion: 'Avoids Purple Prose', relativeScore: 0.95 }],
    weaknesses: [{ criterion: 'Creativity', relativeScore: -1 }],
  },
})};`;

interface StubOpts {
  benchmarks?: unknown;
  benchStatus?: number;
  /** `false` coupe EQ-Bench, pour vérifier que le catalogue survit sans lui. */
  ecriture?: boolean | string;
  radar?: boolean;
  /** Les pages successives de `GET /v1/models` chez Anthropic. */
  anthropic?: unknown[];
  anthropicStatus?: number;
  /** Le corps rendu par 1min.ai, tel quel. */
  onemin?: unknown;
  oneminStatus?: number;
  /** `false` fait tomber la référence elle-même (OpenRouter `/models`). */
  openrouter?: boolean;
}

/** Répond selon l'URL appelée, pour distinguer les appels sortants. */
const stubOpenRouter = (opts: StubOpts = {}) => {
  const appels: Array<{ url: string; auth: string | null; headers: Record<string, string> }> = [];
  let pageAnthropic = 0;
  vi.stubGlobal('fetch', async (url: string, init: any) => {
    const u = String(url);
    const auth = init?.headers?.Authorization ?? init?.headers?.authorization ?? null;
    appels.push({ url: u, auth, headers: { ...(init?.headers ?? {}) } });
    if (u.startsWith('https://api.anthropic.com/')) {
      if (opts.anthropicStatus) return new Response('{}', { status: opts.anthropicStatus });
      const pages = opts.anthropic ?? [];
      return new Response(JSON.stringify(pages[pageAnthropic++] ?? { data: [], has_more: false }), { status: 200 });
    }
    if (u.startsWith('https://api.1min.ai/')) {
      if (opts.oneminStatus) return new Response('{}', { status: opts.oneminStatus });
      return new Response(JSON.stringify(opts.onemin ?? { models: [] }), { status: 200 });
    }
    if (u.includes('/benchmarks')) {
      return new Response(JSON.stringify(opts.benchmarks ?? BENCHMARKS), { status: opts.benchStatus ?? 200 });
    }
    if (u.includes('creative_writing_chartdata')) {
      if (opts.radar === false) return new Response('nope', { status: 500 });
      return new Response(RADAR_ECRITURE, { status: 200 });
    }
    if (u.includes('creative_writing')) {
      if (opts.ecriture === false) return new Response('nope', { status: 503 });
      if (typeof opts.ecriture === 'string') return new Response(opts.ecriture, { status: 200 });
      return new Response(CLASSEMENT_ECRITURE, { status: 200 });
    }
    if (opts.openrouter === false) return new Response('nope', { status: 503 });
    return new Response(JSON.stringify(MODELES), { status: 200 });
  });
  return appels;
};

beforeEach(async () => {
  env = makeEnv();
  token = await createSessionToken(env);
});

// Un stub qui fuit d'un test à l'autre fait tomber huit tests pour un défaut :
// on repart propre à chaque fois.
afterEach(() => vi.unstubAllGlobals());

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

  it('écarte ce qui ne produit ni texte ni image', async () => {
    stubOpenRouter();
    const data = await json(await call('/api/models/catalogue'));
    expect(data.models.map((m: any) => m.id)).not.toContain('google/lyria-3-pro');
    expect(data.models).toHaveLength(3);
  });

  /** Un modèle qui sort une image s'ajoute depuis l'explorateur, et arrive au catalogue comme tel. */
  it('dit quels modèles sortent une image, et les tient hors de la sélection', async () => {
    stubOpenRouter();
    const data = await json(await call('/api/models/catalogue'));
    const image = data.models.find((m: any) => m.id === 'google/gemini-3-pro-image');
    expect(image).toMatchObject({ sortie: 'image', selection: false, promptPrice: 2, completionPrice: 12 });
    expect(data.models.find((m: any) => m.id === 'anthropic/claude-fable-5').sortie).toBe('texte');
  });

  /** Sans clé, l'écran reste utile — et il doit pouvoir dire pourquoi la colonne est vide. */
  it('rend le catalogue même sans clé, en le disant', async () => {
    const appels = stubOpenRouter();
    const data = await json(await call('/api/models/catalogue'));

    expect(data.models).toHaveLength(3);
    expect(data.benchmarksAvailable).toBe(false);
    expect(data.benchmarksReason).toBe('clé absente');
    expect(appels.some(a => a.url.includes('/benchmarks'))).toBe(false);
  });

  it('un refus des benchmarks n’emporte pas le catalogue', async () => {
    stubOpenRouter({ benchStatus: 429 });
    await call('/api/settings/providers/openrouter', {
      method: 'PUT', body: JSON.stringify({ apiKey: 'sk-or-v1-0123456789' }),
    });

    const data = await json(await call('/api/models/catalogue'));
    expect(data.models).toHaveLength(3);
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
    expect(appels.filter(a => a.url.includes('/models')).length).toBeGreaterThan(0);

    // Et surtout : la clé OpenRouter ne doit atteindre AUCUN tiers. EQ-Bench
    // est une source publique ajoutée après coup ; elle n'a rien à recevoir.
    const versTiers = appels.filter(a => !a.url.includes('openrouter.ai'));
    expect(versTiers.length).toBeGreaterThan(0);
    for (const a of versTiers) expect(a.auth).toBeNull();

    const porteuses = appels.filter(a => a.auth !== null);
    for (const a of porteuses) expect(a.url).toContain('openrouter.ai');
  });

  /**
   * Le TTL appartient au cache du Worker, pas au navigateur. Poser une clé puis
   * rouvrir l'écran doit montrer le résultat, pas une réponse d'il y a une heure.
   */
  it('ne demande pas au navigateur de garder le catalogue', async () => {
    stubOpenRouter();
    const magasin = new Map<string, Response>();
    vi.stubGlobal('caches', {
      default: {
        match: async (k: Request) => magasin.get(k.url),
        put: async (k: Request, v: Response) => { magasin.set(k.url, v); },
      },
    });

    const res = await call('/api/models/catalogue');
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    // …alors que la copie mise de côté, elle, porte bien le TTL.
    const garde = [...magasin.values()][0];
    expect(garde?.headers.get('Cache-Control')).toBe('max-age=3600');
  });

  it('exige un jeton de session', async () => {
    stubOpenRouter();
    const res = await app.fetch(new Request('https://api.test/api/models/catalogue'), env as any);
    expect(res.status).toBe(401);
  });
});

/**
 * Les notes d'écriture (SPEC §5.6). Elles viennent d'une source SANS CONTRAT :
 * la question n'est pas seulement « sait-on les lire », mais « que reste-t-il
 * quand elles disparaissent ».
 */
describe('notes d’écriture et courte liste', () => {
  it('lit le CSV enfermé dans le littéral de gabarit', async () => {
    stubOpenRouter();
    const data = await json(await call('/api/models/catalogue'));
    const fable = data.models.find((m: any) => m.id === 'anthropic/claude-fable-5');

    expect(data.ecritureAvailable).toBe(true);
    expect(data.ecritureReason).toBeNull();
    expect(fable).toMatchObject({ elo: 1932.4, ecriture: 16.81, slop: 10.28 });
  });

  it('apparie malgré le préfixe de fabricant et le suffixe de gratuité', async () => {
    stubOpenRouter();
    const data = await json(await call('/api/models/catalogue'));
    // `z-ai/glm-5.2:free` d'un côté, `glm-5.2` de l'autre.
    const glm = data.models.find((m: any) => m.id === 'z-ai/glm-5.2:free');
    expect(glm.ecriture).toBe(16.44);
    expect(glm.slop).toBe(13.1);
  });

  it('rend le profil par critère en français', async () => {
    stubOpenRouter();
    const data = await json(await call('/api/models/catalogue'));
    const fable = data.models.find((m: any) => m.id === 'anthropic/claude-fable-5');

    expect(fable.suivi).toBe(18.49);
    expect(fable.forces).toEqual(['Rythme', "Évite l'emphase"]);
  });

  it('marque la courte liste, du moins cher au plus cher', async () => {
    stubOpenRouter();
    const data = await json(await call('/api/models/catalogue'));

    // Les deux modèles notés passent les seuils ; le gratuit vient en premier.
    expect(data.selection).toEqual(['z-ai/glm-5.2:free', 'anthropic/claude-fable-5']);
    const retenus = data.models.filter((m: any) => m.selection);
    expect(retenus.map((m: any) => m.id).sort()).toEqual(['anthropic/claude-fable-5', 'z-ai/glm-5.2:free']);
    expect(retenus.every((m: any) => typeof m.palierLibelle === 'string')).toBe(true);
  });

  it('un modèle non noté reste au catalogue, hors sélection', async () => {
    stubOpenRouter();
    const data = await json(await call('/api/models/catalogue'));
    // Aucun modèle du catalogue ne s'appelle `gpt-4o-mini` : la note est orpheline,
    // et elle ne doit pas inventer de ligne.
    expect(data.models).toHaveLength(3);
    expect(data.selection).not.toContain('openai/gpt-4o-mini');
  });

  /** Le point qui décide si cette source est acceptable : son absence. */
  it('EQ-Bench injoignable n’emporte pas le catalogue', async () => {
    stubOpenRouter({ ecriture: false });
    const data = await json(await call('/api/models/catalogue'));

    expect(data.models).toHaveLength(3);
    expect(data.ecritureAvailable).toBe(false);
    expect(data.ecritureReason).toBe('refus (503)');
    expect(data.selection).toEqual([]);
    expect(data.models.every((m: any) => m.ecriture === null && m.selection === false)).toBe(true);
  });

  it('un format inattendu se dit, au lieu de faire tomber la route', async () => {
    stubOpenRouter({ ecriture: 'const data = [];' });
    const data = await json(await call('/api/models/catalogue'));

    expect(data.models).toHaveLength(3);
    expect(data.ecritureAvailable).toBe(false);
    expect(data.ecritureReason).toBe('format inattendu');
  });

  it('le profil par critère est un bonus : sans lui, les notes tiennent', async () => {
    stubOpenRouter({ radar: false });
    const data = await json(await call('/api/models/catalogue'));
    const fable = data.models.find((m: any) => m.id === 'anthropic/claude-fable-5');

    expect(data.ecritureAvailable).toBe(true);
    expect(fable.ecriture).toBe(16.81);
    expect(fable.suivi).toBeNull();
    expect(fable.forces).toEqual([]);
    expect(data.selection).toHaveLength(2);
  });
});

/**
 * Les deux autres adaptateurs (SPEC §5.6). Leur liste donne le code exact à
 * poser ; la référence OpenRouter donne prix et notes, par le nom normalisé.
 */
describe('explorateur par adaptateur', () => {
  const poserCle = (fournisseur: string, apiKey: string) =>
    call(`/api/settings/providers/${fournisseur}`, { method: 'PUT', body: JSON.stringify({ apiKey }) });

  const ANTHROPIC = [
    {
      data: [{ type: 'model', id: 'claude-fable-5-20261015', display_name: 'Claude Fable 5',
        created_at: '2026-10-15T00:00:00Z', max_input_tokens: 1000000 }],
      has_more: true, last_id: 'claude-fable-5-20261015',
    },
    {
      data: [{ type: 'model', id: 'claude-haiku-9', display_name: 'Claude Haiku 9', created_at: '2026-01-01T00:00:00Z' }],
      has_more: false, last_id: 'claude-haiku-9',
    },
  ];

  it('Anthropic sans clé : un refus qui dit où la poser, sans appel sortant', async () => {
    const appels = stubOpenRouter({ anthropic: ANTHROPIC });
    const res = await call('/api/models/catalogue/anthropic');
    expect(res.status).toBe(409);
    expect((await json(res)).error).toContain('Réglages → Fournisseurs');
    expect(appels.some(a => a.url.includes('anthropic.com'))).toBe(false);
  });

  it('Anthropic : toutes les pages, le code exact, et les mesures de la référence', async () => {
    const appels = stubOpenRouter({ anthropic: ANTHROPIC });
    await poserCle('anthropic', 'sk-ant-api03-0123456789');
    const data = await json(await call('/api/models/catalogue/anthropic'));

    expect(data.source).toBe('anthropic');
    expect(data.models.map((m: any) => m.id)).toEqual(['claude-fable-5-20261015', 'claude-haiku-9']);
    const fable = data.models[0];
    expect(fable).toMatchObject({
      name: 'Claude Fable 5', contextLength: 1000000, reference: 'anthropic/claude-fable-5',
      promptPrice: 10, completionPrice: 50, ecriture: 16.81, sortie: 'texte',
    });
    expect(fable.creeLe).toBe(Date.parse('2026-10-15T00:00:00Z'));
    // Sans correspondant, le modèle reste listé — sans prix ni note.
    expect(data.models[1]).toMatchObject({ reference: null, promptPrice: null, ecriture: null });

    const versAnthropic = appels.filter(a => a.url.includes('anthropic.com'));
    expect(versAnthropic).toHaveLength(2);
    expect(versAnthropic[1].url).toContain('after_id=claude-fable-5-20261015');
    for (const a of versAnthropic) expect(a.headers['x-api-key']).toBe('sk-ant-api03-0123456789');
  });

  it('la clé Anthropic ne part qu’à Anthropic', async () => {
    const appels = stubOpenRouter({ anthropic: ANTHROPIC });
    await poserCle('anthropic', 'sk-ant-api03-0123456789');
    await call('/api/models/catalogue/anthropic');
    for (const a of appels.filter(x => !x.url.includes('anthropic.com'))) {
      expect(JSON.stringify(a.headers)).not.toContain('sk-ant-api03');
    }
  });

  it('Anthropic refuse la clé : un refus à corriger, pas une panne', async () => {
    stubOpenRouter({ anthropicStatus: 401 });
    await poserCle('anthropic', 'sk-ant-api03-0123456789');
    const res = await call('/api/models/catalogue/anthropic');
    expect(res.status).toBe(409);
    expect((await json(res)).error).toContain('refuse la clé');
  });

  it('la référence muette n’emporte pas la liste Anthropic', async () => {
    stubOpenRouter({ anthropic: ANTHROPIC, openrouter: false });
    await poserCle('anthropic', 'sk-ant-api03-0123456789');
    const data = await json(await call('/api/models/catalogue/anthropic'));
    expect(data.models).toHaveLength(2);
    expect(data.referenceAvailable).toBe(false);
    expect(data.models[0].promptPrice).toBeNull();
  });

  it('1min.ai : la forme constatée, sans doublon, rapprochée de la référence', async () => {
    stubOpenRouter({
      onemin: { models: [{ modelId: 'claude-fable-5' }, { modelId: 'claude-fable-5' }, { modelId: 'glm-5.2', name: 'GLM 5.2' }, { autre: 1 }] },
    });
    const data = await json(await call('/api/models/catalogue/onemin'));
    expect(data.source).toBe('onemin');
    expect(data.models.map((m: any) => m.id)).toEqual(['claude-fable-5', 'glm-5.2']);
    // Sans nom publié, celui de la référence : « Claude Fable 5 » plutôt que son code.
    expect(data.models[0]).toMatchObject({ name: 'Claude Fable 5', reference: 'anthropic/claude-fable-5', selection: true });
    // `z-ai/glm-5.2:free` est la seule variante de la référence : elle sert faute de mieux.
    expect(data.models[1]).toMatchObject({ name: 'GLM 5.2', reference: 'z-ai/glm-5.2:free' });
    expect(data.selection.sort()).toEqual(['claude-fable-5', 'glm-5.2']);
  });

  it('1min.ai accepte un tableau nu', async () => {
    stubOpenRouter({ onemin: ['gpt-9', { modelId: 'claude-fable-5' }] });
    const data = await json(await call('/api/models/catalogue/onemin'));
    expect(data.models.map((m: any) => m.id)).toEqual(['gpt-9', 'claude-fable-5']);
  });

  it('1min.ai illisible : le dit, en 502, sans trace', async () => {
    stubOpenRouter({ onemin: { quelqueChose: 'autre' } });
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call('/api/models/catalogue/onemin');
    expect(res.status).toBe(502);
    expect((await json(res)).error).toContain('1min.ai');
    expect(erreurs).not.toHaveBeenCalled();
    erreurs.mockRestore();
  });

  it('1min.ai : la clé, si elle est posée, ne part qu’à 1min.ai', async () => {
    const appels = stubOpenRouter({ onemin: { models: [{ modelId: 'claude-fable-5' }] } });
    await poserCle('onemin', 'cle-1min-0123456789');
    await call('/api/models/catalogue/onemin');
    const vers1min = appels.filter(a => a.url.startsWith('https://api.1min.ai/'));
    expect(vers1min[0].headers['API-KEY']).toBe('cle-1min-0123456789');
    for (const a of appels.filter(x => !x.url.startsWith('https://api.1min.ai/'))) {
      expect(JSON.stringify(a.headers)).not.toContain('cle-1min');
    }
  });
});
