/**
 * L'essai à blanc (SPEC §14.3) : la porte appelle la liaison, rend sa réponse
 * re-sérialisée, et ne sert rien d'autre. La liaison réelle — deux Workers,
 * une entrée nommée — ne se voit qu'en recette ; ici, elle est simulée.
 */
import { describe, it, expect, vi } from 'vitest';
import porte, { type Env } from '../src/index';

const appeler = (env: Env, methode = 'POST', chemin = '/v1/essai') =>
  porte.fetch(new Request(`https://api-recette.luminose.fr${chemin}`, { method: methode }), env);

const ENTETES_ATTENDUS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
};
const entetes = (r: Response) => Object.fromEntries([...r.headers.entries()].sort());

describe('POST /v1/essai', () => {
  it('appelle l’entrée Essai de gestion et rend sa réponse', async () => {
    const ping = vi.fn(async () => ({ ok: true as const, base: true }));
    const r = await appeler({ GESTION_ESSAI: { ping } });
    expect(ping).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, base: true });
    expect(entetes(r)).toEqual(ENTETES_ATTENDUS);
  });

  it('re-sérialise : un champ de plus venu de gestion ne traverse pas', async () => {
    const ping = vi.fn(async () => ({ ok: true, base: false, repere: 'ne doit pas sortir' }) as never);
    const r = await appeler({ GESTION_ESSAI: { ping } });
    expect(await r.text()).toBe('{"ok":true,"base":false}');
  });

  it('gestion lève : 503, corps vide, un code fixe au journal et rien d’autre', async () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ping = vi.fn(async () => { throw new Error('détail interne à ne pas journaliser'); });
    const r = await appeler({ GESTION_ESSAI: { ping } });
    expect(r.status).toBe(503);
    expect(await r.text()).toBe('');
    expect(entetes(r)).toEqual(ENTETES_ATTENDUS);
    expect(erreur.mock.calls).toEqual([['porte.panne']]);
  });

  it('une réponse hors de la forme attendue est une panne', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ping = vi.fn(async () => ({ ok: 'oui' }) as never);
    const r = await appeler({ GESTION_ESSAI: { ping } });
    expect(r.status).toBe(503);
    expect(await r.text()).toBe('');
  });

  it('sans liaison — la racine, jamais déployée — : 503, corps vide', async () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await appeler({});
    expect(r.status).toBe(503);
    expect(await r.text()).toBe('');
    expect(erreur.mock.calls).toEqual([['porte.non_reliee']]);
  });
});

describe('toute autre adresse', () => {
  const ping = vi.fn(async () => ({ ok: true as const, base: true }));

  it.each([
    ['GET', '/v1/essai'],
    ['POST', '/v1/essai/'],
    ['POST', '/'],
    ['GET', '/'],
    ['POST', '/v1/questionnaires'],
    ['POST', '/service/v1/confirmations'],
    ['POST', '/api/contents'],
    ['OPTIONS', '/v1/essai'],
  ])('%s %s : 404, corps vide, sans appeler gestion', async (methode, chemin) => {
    ping.mockClear();
    const r = await appeler({ GESTION_ESSAI: { ping } }, methode, chemin);
    expect(r.status).toBe(404);
    expect(await r.text()).toBe('');
    expect(entetes(r)).toEqual(ENTETES_ATTENDUS);
    expect(ping).not.toHaveBeenCalled();
  });
});

describe('dépendances (SPEC §14.3)', () => {
  it('la porte n’importe que packages/contrat — rien de workers/api', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = join(import.meta.dirname, '..', 'src');
    const specs = readdirSync(src, { recursive: true, withFileTypes: true })
      .filter((f) => f.isFile() && f.name.endsWith('.ts'))
      .flatMap((f) => [...readFileSync(join(f.parentPath, f.name), 'utf8').matchAll(/\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g)])
      .map((m) => m[1] ?? m[2]);
    const externes = [...new Set(specs.filter((s) => !s.startsWith('./')))];
    expect(externes.filter((s) => s !== '@luminose/contrat' && s !== 'cloudflare:workers')).toEqual([]);
  });
});
