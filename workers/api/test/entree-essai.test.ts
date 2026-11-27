/**
 * L'entrée d'essai (SPEC §14.3, phase S2b, partie A) : une méthode, aucune
 * donnée, et aucune adresse de gestion qui y mène. Que la liaison de service
 * l'atteigne réellement ne se voit qu'en recette.
 */
import { describe, it, expect } from 'vitest';
import worker, { Essai } from '../src/index';
import { makeEnv } from './helpers/d1';

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

describe('Essai.ping', () => {
  it('base reliée : { ok: true, base: true }, sans requête', async () => {
    const env = makeEnv({ clients: true });
    expect(await new Essai(ctx, env as never).ping()).toEqual({ ok: true, base: true });
  });

  it('base non reliée — la production — : { ok: true, base: false }', async () => {
    expect(await new Essai(ctx, makeEnv() as never).ping()).toEqual({ ok: true, base: false });
  });
});

describe('l’export par défaut ne change pas', () => {
  it('fetch et scheduled, et rien d’autre', () => {
    expect(Object.keys(worker).sort()).toEqual(['fetch', 'scheduled']);
  });

  it.each(['/v1/essai', '/api/essai', '/essai', '/api/essai/ping'])('POST %s ne mène pas à l’entrée', async (chemin) => {
    const r = await worker.fetch(new Request(`https://gestion-recette.luminose.fr${chemin}`, { method: 'POST' }), makeEnv({ clients: true }) as never, ctx);
    expect([401, 404]).toContain(r.status);
    expect(await r.text()).not.toMatch(/"base"/);
  });
});
