/**
 * La veille des modèles (SPEC §5.7).
 *
 * Ce qui compte : une source muette ne fait taire qu'elle-même, une
 * proposition écartée ne revient pas, et une proposition ajoutée au
 * catalogue cesse de s'afficher sans qu'on ait rien à effacer.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { createSessionToken } from '../src/auth';
import { makeEnv } from './helpers/d1';

let env: ReturnType<typeof makeEnv>;
let token: string;

const call = (path: string, init: RequestInit = {}) =>
  worker.fetch(new Request(`https://api.test${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Session-Token': token, ...(init.headers || {}) },
  }), env as any);
const post = (path: string, body: unknown = {}) => call(path, { method: 'POST', body: JSON.stringify(body) });
const json = async (r: Response) => await r.json() as any;

interface Stub {
  openrouter?: string[];
  anthropic?: string[];
  onemin?: string[] | number;
}

/** Une liste par source ; un nombre à la place d'une liste répond ce statut. */
const stubSources = (s: Stub) => {
  const appels: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    const u = String(url);
    appels.push(u);
    if (u.startsWith('https://api.anthropic.com/')) {
      return new Response(JSON.stringify({
        data: (s.anthropic ?? []).map(id => ({ id, display_name: id, created_at: '2026-10-15T00:00:00Z' })),
        has_more: false,
      }), { status: 200 });
    }
    if (u.startsWith('https://api.1min.ai/')) {
      if (typeof s.onemin === 'number') return new Response('{}', { status: s.onemin });
      return new Response(JSON.stringify({ models: (s.onemin ?? []).map(modelId => ({ modelId })) }), { status: 200 });
    }
    return new Response(JSON.stringify({
      data: (s.openrouter ?? []).map(id => ({ id, name: id, architecture: { output_modalities: ['image', 'text'] } })),
    }), { status: 200 });
  });
  return appels;
};

const ajouterModele = (name: string, apiCode: string, provider: string) =>
  post('/api/models', { name, apiCode, provider });

beforeEach(async () => {
  env = makeEnv();
  token = await createSessionToken(env);
  // Les trois modèles d'image de la migration 0014 sont suivis chez OpenRouter.
  await ajouterModele('Claude Fable 5', 'claude-fable-5', 'onemin');
  await ajouterModele('Claude Opus 4.5', 'claude-opus-4-5', 'anthropic');
});

afterEach(() => vi.unstubAllGlobals());

describe('veille des modèles', () => {
  it('trouve la version suivante sur chaque adaptateur suivi', async () => {
    stubSources({
      openrouter: ['google/gemini-3-pro-image', 'google/gemini-3.5-pro-image', 'google/gemini-3.5-flash-image'],
      anthropic: ['claude-opus-4-5-20251101', 'claude-opus-5-20261015'],
      onemin: ['claude-fable-5', 'claude-fable-6', 'claude-fable-6-mini'],
    });
    await call('/api/settings/providers/anthropic', { method: 'PUT', body: JSON.stringify({ apiKey: 'sk-ant-api03-0123456789' }) });

    const data = await json(await post('/api/models/veille/lancer'));
    const codes = data.propositions.map((p: any) => `${p.provider}:${p.apiCode}`).sort();
    // Nano Banana 2 (`gemini-3.1-flash-image`) est suivi lui aussi : sa lignée a sa propre suite.
    expect(codes).toEqual([
      'anthropic:claude-opus-5-20261015',
      'onemin:claude-fable-6',
      'openrouter:google/gemini-3.5-flash-image',
      'openrouter:google/gemini-3.5-pro-image',
    ]);
    const opus = data.propositions.find((p: any) => p.provider === 'anthropic');
    expect(opus).toMatchObject({ remplaceNom: 'Claude Opus 4.5', publieLe: Date.parse('2026-10-15T00:00:00Z') });
    expect(data.etat.sources).toMatchObject({
      openrouter: { lue: true }, anthropic: { lue: true }, onemin: { lue: true, suivis: 1 },
    });
    expect(data.etat.propositions).toBe(4);
  });

  it('sans clé Anthropic : le dit, sans appeler Anthropic, et lit les autres', async () => {
    const appels = stubSources({ onemin: ['claude-fable-6'] });
    const data = await json(await post('/api/models/veille/lancer'));
    expect(data.etat.sources.anthropic).toEqual({ lue: false, raison: 'aucune clé posée', suivis: 1 });
    expect(appels.some(u => u.includes('anthropic.com'))).toBe(false);
    expect(data.propositions.map((p: any) => p.apiCode)).toEqual(['claude-fable-6']);
  });

  it('une source muette ne fait taire qu’elle-même, et garde ses propositions', async () => {
    stubSources({ onemin: ['claude-fable-6'] });
    await post('/api/models/veille/lancer');

    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubSources({ onemin: 503, openrouter: ['google/gemini-3.5-pro-image'] });
    const data = await json(await post('/api/models/veille/lancer'));
    expect(data.etat.sources.onemin).toMatchObject({ lue: false, raison: expect.stringContaining('503') });
    // La proposition d'hier tient : une source muette ne dit pas qu'elle est fausse.
    expect(data.propositions.map((p: any) => p.apiCode).sort()).toEqual(['claude-fable-6', 'google/gemini-3.5-pro-image']);
    expect(erreurs).not.toHaveBeenCalled();
    erreurs.mockRestore();
  });

  it('une proposition écartée ne revient pas ; une plus récente, si', async () => {
    stubSources({ onemin: ['claude-fable-6'] });
    await post('/api/models/veille/lancer');
    expect((await post('/api/models/veille/ignorer', { id: 'onemin:claude-fable-6' })).status).toBe(200);
    expect((await json(await call('/api/models/veille'))).propositions).toEqual([]);

    await post('/api/models/veille/lancer');
    expect((await json(await call('/api/models/veille'))).propositions).toEqual([]);

    stubSources({ onemin: ['claude-fable-6', 'claude-fable-7'] });
    const data = await json(await post('/api/models/veille/lancer'));
    expect(data.propositions.map((p: any) => p.apiCode)).toEqual(['claude-fable-7']);
  });

  it('ajoutée au catalogue, elle cesse de s’afficher — puis disparaît au passage suivant', async () => {
    stubSources({ onemin: ['claude-fable-6'] });
    await post('/api/models/veille/lancer');
    await ajouterModele('Claude Fable 6', 'claude-fable-6', 'onemin');
    expect((await json(await call('/api/models/veille'))).propositions).toEqual([]);

    await post('/api/models/veille/lancer');
    const reste = env.DB.prepare("SELECT COUNT(*) AS n FROM veille_modeles WHERE provider = 'onemin'");
    expect(((await reste.first()) as any).n).toBe(0);
  });

  it('le même code sur un AUTRE adaptateur ne la fait pas disparaître', async () => {
    stubSources({ onemin: ['claude-fable-6'] });
    await post('/api/models/veille/lancer');
    await ajouterModele('Claude Fable 6', 'claude-fable-6', 'anthropic');
    expect((await json(await call('/api/models/veille'))).propositions).toHaveLength(1);
  });

  it('écarter une proposition inconnue : un refus, pas une panne', async () => {
    stubSources({});
    const res = await post('/api/models/veille/ignorer', { id: 'onemin:rien' });
    expect(res.status).toBe(404);
    expect((await post('/api/models/veille/ignorer', {})).status).toBe(400);
  });

  it('le déclencheur planifié fait le même passage', async () => {
    stubSources({ onemin: ['claude-fable-6'] });
    const attentes: Promise<unknown>[] = [];
    worker.scheduled({} as any, env as any, { waitUntil: (p: Promise<unknown>) => attentes.push(p) } as any);
    await Promise.all(attentes);
    const data = await json(await call('/api/models/veille'));
    expect(data.propositions.map((p: any) => p.apiCode)).toEqual(['claude-fable-6']);
    expect(data.etat.le).toBeGreaterThan(0);
  });

  it('avant tout passage : une liste vide, et aucun état', async () => {
    const data = await json(await call('/api/models/veille'));
    expect(data).toEqual({ propositions: [], etat: null });
  });

  it('exige un jeton de session', async () => {
    const res = await worker.fetch(new Request('https://api.test/api/models/veille'), env as any);
    expect(res.status).toBe(401);
  });
});
