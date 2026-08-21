/**
 * Export complet (SPEC §9.4).
 *
 * Le filet « en régime » : Time Travel ne couvre que 7 jours. Ce qui est
 * vérifié ici n'est pas qu'un JSON sorte, mais qu'il sorte ENTIER — y compris
 * les lignes supprimées, qui sont précisément ce qu'on vient y rechercher.
 */
import { describe, it, expect, beforeEach } from 'vitest';
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

const post = (p: string, b: unknown) => call(p, { method: 'POST', body: JSON.stringify(b) });
const json = async (r: Response) => await r.json() as any;

beforeEach(async () => {
  env = makeEnv();
  token = await createSessionToken(env);
});

describe('export', () => {
  it('rend toutes les tables en une seule lecture', async () => {
    const content = (await json(await post('/api/contents', { title: 'Un contenu' }))).content;
    await post('/api/series', { titre: 'Une série' });
    await post('/api/models', { name: 'Un modèle', apiCode: 'code' });
    await post(`/api/contents/${content.id}/coach/messages`, { role: 'user', content: 'Bonjour' });
    await post(`/api/contents/${content.id}/generations`, {
      kind: 'draft', target: 'draft', modelLabel: 'M', payload: '{"format":"Post Texte"}', apply: true,
    });

    const res = await call('/api/export');
    expect(res.status).toBe(200);

    const data = await json(res);
    expect(data.contents).toHaveLength(1);
    expect(data.series).toHaveLength(1);
    expect(data.models).toHaveLength(1);
    expect(data.coachMessages).toHaveLength(1);
    expect(data.generations).toHaveLength(1);
    expect(data.exportedAt).toBeGreaterThan(0);
    expect(data.formatVersion).toBe(1);
  });

  /** Une sauvegarde qui omet les suppressions ne sauve pas de la suppression. */
  it('emporte AUSSI les lignes supprimées', async () => {
    const content = (await json(await post('/api/contents', { title: 'Supprimé ensuite' }))).content;
    await call(`/api/contents/${content.id}`, { method: 'DELETE' });

    const data = await json(await call('/api/export'));
    expect(data.contents).toHaveLength(1);
    expect(data.contents[0].deletedAt).toBeGreaterThan(0);
  });

  it('se télécharge sous un nom daté', async () => {
    const res = await call('/api/export');
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="luminose-export-\d{4}-\d{2}-\d{2}\.json"/);
  });

  it('exige un jeton de session comme le reste de l’API', async () => {
    const res = await app.fetch(new Request('https://api.test/api/export'), env as any);
    expect(res.status).toBe(401);
  });
});
