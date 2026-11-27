/**
 * Ce que la porte sert, et rien d'autre (SPEC §14.5) : toute adresse ou
 * méthode hors de sa liste rend 404, corps vide, sans appeler gestion — l'essai
 * à blanc de la partie A compris, retiré au dernier commit de la phase. Et la
 * porte n'importe rien de workers/api (§14.3).
 */
import { describe, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import porte, { type Env } from '../src/index';

const ENTETES_ATTENDUS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
};
const entetes = (r: Response) => Object.fromEntries([...r.headers.entries()].sort());

describe('toute autre adresse', () => {
  const gestion = { questionnaire: vi.fn(), lienQuestionnaire: vi.fn() };
  const service = { confirmation: vi.fn() };
  const env = { ORIGINE_SITE: 'https://essai-recette.luminose.fr', GESTION_PUBLIQUE: gestion, GESTION_SERVICE: service } as unknown as Env;

  it.each([
    ['POST', '/v1/essai'],
    ['GET', '/v1/essai'],
    ['POST', '/v1/questionnaires/'],
    ['POST', '/v1/questionnaire'],
    ['POST', '/'],
    ['GET', '/'],
    ['GET', '/v1/questionnaires'],
    ['PUT', '/service/v1/confirmations'],
    ['OPTIONS', '/service/v1/confirmations'],
    ['POST', '/api/contents'],
    ['GET', '/.env'],
  ])('%s %s : 404, corps vide, sans appeler gestion', async (methode, chemin) => {
    const r = await porte.fetch(new Request(`https://api-recette.luminose.fr${chemin}`, { method: methode }), env);
    expect(r.status).toBe(404);
    expect(await r.text()).toBe('');
    expect(entetes(r)).toEqual(ENTETES_ATTENDUS);
    expect(gestion.questionnaire).not.toHaveBeenCalled();
    expect(gestion.lienQuestionnaire).not.toHaveBeenCalled();
    expect(service.confirmation).not.toHaveBeenCalled();
  });
});

describe('dépendances (SPEC §14.3)', () => {
  it('la porte n’importe que packages/contrat — rien de workers/api', () => {
    const src = join(import.meta.dirname, '..', 'src');
    const specs = readdirSync(src, { recursive: true, withFileTypes: true })
      .filter((f) => f.isFile() && f.name.endsWith('.ts'))
      .flatMap((f) => [...readFileSync(join(f.parentPath, f.name), 'utf8').matchAll(/\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g)])
      .map((m) => m[1] ?? m[2]);
    expect(specs.length).toBeGreaterThan(0);
    const externes = [...new Set(specs.filter((s) => !s.startsWith('./') && !s.startsWith('../')))];
    expect(externes.filter((s) => s !== '@luminose/contrat' && s !== 'cloudflare:workers')).toEqual([]);
    expect(specs.filter((s) => /workers\/api|\.\.\/\.\.\//.test(s))).toEqual([]);
  });
});
