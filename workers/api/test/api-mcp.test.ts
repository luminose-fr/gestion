/**
 * Le serveur MCP, appelant de cette API (SPEC §7, v2.34 ; acces-mcp.ts).
 *
 * Ce que ces tests protègent : un jeton qui n'ouvre QUE les contenus et les
 * séries, et sur eux, que ce que Florent a accordé le 03/11/2026 — la fiche,
 * le brouillon par le journal, le regroupement d'idées. Le reste de l'API —
 * réglages, IA, export, suppressions — lui reste fermé, et la console ne voit
 * aucune différence.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { LIBELLE_MCP } from '../src/acces-mcp';
import { makeEnv } from './helpers/d1';

const JETON_MCP = 'jeton-du-serveur-mcp-de-test';
const empreinte = async (jeton: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(jeton)))]
    .map((o) => o.toString(16).padStart(2, '0')).join('');

let env: ReturnType<typeof makeEnv> & { MCP_JETON_EMPREINTE?: string };
let session: string;

const requete = (path: string, init: RequestInit & { porteur?: string; session?: boolean } = {}) =>
  app.fetch(new Request(`https://api.test${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.porteur !== undefined ? { Authorization: `Bearer ${init.porteur}` } : {}),
      ...(init.session ? { 'X-Session-Token': session } : {}),
    },
  }), env as any);

const mcp = (path: string, methode = 'GET', corps?: unknown) =>
  requete(path, { method: methode, porteur: JETON_MCP, ...(corps === undefined ? {} : { body: JSON.stringify(corps) }) });
const console_ = (path: string, methode = 'GET', corps?: unknown) =>
  requete(path, { method: methode, session: true, ...(corps === undefined ? {} : { body: JSON.stringify(corps) }) });
const json = async (r: Response) => await r.json() as any;

const creer = async (champs: Record<string, unknown> = {}) =>
  (await json(await console_('/api/contents', 'POST', { title: 'Le piège chinois', ...champs }))).content;

/** Un brouillon tel que le Rédacteur l'écrit pour un post court. */
const POST_COURT = JSON.stringify({ format: 'Post Texte', accroche: 'Et si la peur était une boussole ?', corps: 'Trois lignes.', cta: 'Écrivez-moi.' });

beforeEach(async () => {
  env = { ...makeEnv(), MCP_JETON_EMPREINTE: await empreinte(JETON_MCP) };
  session = await createSessionToken(env);
});

describe('NORMATIF — le jeton du serveur MCP', () => {
  it('ouvre la lecture des contenus', async () => {
    await creer();
    const res = await mcp('/api/contents');
    expect(res.status).toBe(200);
    expect((await json(res)).items).toHaveLength(1);
  });

  it('sans empreinte posée, un porteur est refusé, et la console fonctionne à l’identique', async () => {
    delete env.MCP_JETON_EMPREINTE;
    const res = await mcp('/api/contents');
    expect(res.status).toBe(401);
    expect((await json(res)).error).toMatch(/MCP_JETON_EMPREINTE absent/);
    expect((await console_('/api/contents')).status).toBe(200);
  });

  it('un autre jeton est refusé — et l’empreinte elle-même n’en est pas un', async () => {
    for (const faux of ['un-autre-jeton', env.MCP_JETON_EMPREINTE!, '']) {
      const res = await requete('/api/contents', { porteur: faux });
      expect(res.status, faux).toBe(401);
    }
  });

  it('ne s’ouvre pas sur le reste de l’API, ni sur les suppressions', async () => {
    const c = await creer();
    const fermees: [string, string, unknown?][] = [
      ['/api/settings/providers', 'GET'],
      ['/api/settings/providers/anthropic', 'PUT', { apiKey: 'sk-ant-x' }],
      ['/api/ai/chat', 'POST', { modelId: 'm', messages: [{ role: 'user', content: 'x' }] }],
      ['/api/export', 'GET'],
      ['/api/models', 'GET'],
      ['/api/corpus', 'GET'],
      [`/api/contents/${c.id}`, 'DELETE'],
      ['/api/contents/batch', 'POST', { items: [{ title: 'x' }] }],
      [`/api/contents/${c.id}/coach/messages`, 'POST', { role: 'user', content: 'x' }],
      [`/api/contents/${c.id}/generations/g1/revert`, 'POST', {}],
      ['/api/series', 'POST', { titre: 'x' }],
      ['/api/series/s1', 'PATCH', { titre: 'x' }],
      ['/api/series/s1', 'DELETE'],
    ];
    for (const [chemin, methode, corps] of fermees) {
      const res = await mcp(chemin, methode, corps);
      expect(res.status, `${methode} ${chemin}`).toBe(403);
    }
    expect((await json(await console_(`/api/contents/${c.id}`))).content.deletedAt).toBeNull();
  });
});

describe('NORMATIF — sur un contenu, le serveur MCP n’écrit que la fiche', () => {
  it('crée une idée, et modifie sa fiche — un changement de statut laisse un geste', async () => {
    const cree = await json(await mcp('/api/contents', 'POST', { title: 'La peur, une boussole', notes: 'Matière : …', platforms: ['Instagram'] }));
    expect(cree.content).toMatchObject({ title: 'La peur, une boussole', status: 'Idée', platforms: ['Instagram'] });

    const modifie = await mcp(`/api/contents/${cree.content.id}`, 'PATCH', {
      status: 'Brouillon', targetFormat: 'Post Texte (Court)', angle: 'La peur comme information', scheduledDate: '2026-11-20',
    });
    expect(modifie.status).toBe(200);
    expect((await json(modifie)).content).toMatchObject({ status: 'Brouillon', targetFormat: 'Post Texte (Court)', scheduledDate: '2026-11-20' });
    expect((await json(await console_(`/api/contents/${cree.content.id}`))).gestes).toEqual([
      expect.objectContaining({ statut: 'Brouillon', avant: 'Idée' }),
    ]);
  });

  it('refuse le brouillon, les slides, la série et l’analyse par la fiche', async () => {
    const c = await creer();
    for (const champs of [{ draft: POST_COURT }, { slides: '[]' }, { serieId: 's1' }, { seriePosition: 1 }, { verdict: 'Valide' }, { analyzedAt: 1 }]) {
      const res = await mcp(`/api/contents/${c.id}`, 'PATCH', champs);
      expect(res.status, JSON.stringify(champs)).toBe(403);
      expect((await json(res)).error).toMatch(/n'écrit que la fiche/);
    }
    expect((await mcp('/api/contents', 'POST', { title: 'x', draft: POST_COURT })).status).toBe(403);
    expect((await json(await console_(`/api/contents/${c.id}`))).content.draft).toBeNull();
  });

  it('la console, elle, garde tous ses champs', async () => {
    const c = await creer();
    const res = await console_(`/api/contents/${c.id}`, 'PATCH', { draft: POST_COURT, verdict: 'Valide' });
    expect(res.status).toBe(200);
  });
});

describe('NORMATIF — le brouillon du serveur MCP passe par le journal', () => {
  const brouillon = (id: string, corps: Record<string, unknown>) => mcp(`/api/contents/${id}/generations`, 'POST', {
    kind: 'draft', target: 'draft', apply: true, modelLabel: 'Opus', instruction: 'Accroche resserrée', payload: POST_COURT, ...corps,
  });

  it('vérifié, appliqué, signé Claude (MCP) quoi que dise la requête, sans coût — et le gabarit du format se lit', async () => {
    const c = await creer({ targetFormat: 'Post Texte (Court)' });
    const lu = await json(await mcp(`/api/contents/${c.id}`));
    expect(lu.gabaritBrouillon).toMatch(/"format": "Post Texte"/);
    expect((await json(await console_(`/api/contents/${c.id}`))).gabaritBrouillon).toBeUndefined();

    const res = await brouillon(c.id, { modelId: 'modele-du-catalogue', costUsd: 1.5, payload: '```json\n' + POST_COURT + '\n```' });
    expect(res.status).toBe(201);
    expect((await json(res)).generation).toMatchObject({ modelLabel: LIBELLE_MCP, modelId: null, costUsd: null, instruction: 'Accroche resserrée' });
    expect((await json(await console_(`/api/contents/${c.id}`))).content.draft).toBe(POST_COURT);
  });

  it('annulable depuis la console : le brouillon d’avant revient', async () => {
    const c = await creer({ targetFormat: 'Post Texte (Court)' });
    const avant = JSON.stringify({ format: 'Post Texte', accroche: 'Version de Florent', corps: 'x', cta: 'y' });
    const premiere = await json(await console_(`/api/contents/${c.id}/generations`, 'POST', {
      kind: 'draft', target: 'draft', apply: true, modelLabel: 'Opus', payload: avant,
    }));
    await brouillon(c.id, {});
    expect((await console_(`/api/contents/${c.id}/generations/${premiere.generation.id}/revert`, 'POST', {})).status).toBe(200);
    expect((await json(await console_(`/api/contents/${c.id}`))).content.draft).toBe(avant);
  });

  it('une retouche à la main, hors journal, y est versée avant d’être remplacée — et une seule fois', async () => {
    const c = await creer({ targetFormat: 'Post Texte (Court)' });
    const retouche = JSON.stringify({ format: 'Post Texte', accroche: 'Retouchée à la main', corps: 'x', cta: 'y' });
    await console_(`/api/contents/${c.id}`, 'PATCH', { draft: retouche });
    await brouillon(c.id, {});
    await brouillon(c.id, { payload: JSON.stringify({ format: 'Post Texte', accroche: 'Seconde', corps: 'x', cta: 'y' }) });

    const { generations } = await json(await console_(`/api/contents/${c.id}/generations`));
    expect(generations.map((g: any) => g.modelLabel)).toEqual([LIBELLE_MCP, LIBELLE_MCP, 'Version en place']);
    const enPlace = generations[2];
    expect(enPlace).toMatchObject({ payload: retouche, kind: 'draft', target: 'draft', modelId: null });
    expect((await console_(`/api/contents/${c.id}/generations/${enPlace.id}/revert`, 'POST', {})).status).toBe(200);
    expect((await json(await console_(`/api/contents/${c.id}`))).content.draft).toBe(retouche);
  });

  it('refuse ce qui n’est pas un brouillon appliqué, sans raison, sans format, d’un autre format, ou illisible', async () => {
    const sansFormat = await creer();
    const c = await creer({ targetFormat: 'Post Texte (Court)' });
    const cas: [string, Record<string, unknown>, number, RegExp][] = [
      [c.id, { kind: 'cold_read', target: null }, 403, /que des brouillons/],
      [c.id, { kind: 'draft', target: 'slides' }, 403, /que des brouillons/],
      [c.id, { apply: false }, 403, /que des brouillons/],
      [c.id, { instruction: '  ' }, 400, /Dire pourquoi/],
      [sansFormat.id, {}, 409, /n'a pas de format/],
      [c.id, { payload: JSON.stringify({ format: 'Carrousel', slides: [] }) }, 400, /au format « Carrousel \(Slide par Slide\) », le contenu attend « Post Texte \(Court\) »/],
      [c.id, { payload: 'pas du JSON' }, 400, /Brouillon refusé/],
      [c.id, { payload: JSON.stringify({ format: 'Haïku' }) }, 400, /Format de sortie invalide/],
      ['inconnu', {}, 404, /introuvable/],
    ];
    for (const [id, corps, statut, motif] of cas) {
      const res = await brouillon(id, corps);
      expect(res.status, JSON.stringify(corps)).toBe(statut);
      expect((await json(res)).error, JSON.stringify(corps)).toMatch(motif);
    }
    expect((await json(await console_(`/api/contents/${c.id}/generations`))).generations).toEqual([]);
  });
});

describe('NORMATIF — regrouper des idées en série', () => {
  it('crée la série et y range les idées dans l’ordre donné, angles compris ; elles restent des idées', async () => {
    const [a, b, c] = [await creer({ title: 'A', angle: 'ancien' }), await creer({ title: 'B' }), await creer({ title: 'C' })];
    const res = await mcp('/api/series/regrouper', 'POST', {
      titre: 'La peur', intention: 'Recadrer la peur', contenus: [{ id: c.id, angle: 'ouvrir' }, { id: a.id }, { id: b.id, angle: 'conclure' }],
    });
    expect(res.status).toBe(201);
    const { serie, contents } = await json(res);
    expect(serie).toMatchObject({ titre: 'La peur', intention: 'Recadrer la peur', statut: 'en_cours', sourceContentId: null });
    expect(contents.map((x: any) => [x.title, x.seriePosition, x.angle, x.status, x.serieId])).toEqual([
      ['C', 1, 'ouvrir', 'Idée', serie.id], ['A', 2, 'ancien', 'Idée', serie.id], ['B', 3, 'conclure', 'Idée', serie.id],
    ]);
    const lue = await json(await mcp(`/api/series/${serie.id}`));
    expect(lue.contents.map((x: any) => x.title)).toEqual(['C', 'A', 'B']);
  });

  it('refuse ce qui n’est plus une idée, ce qui est déjà rangé, ce qui manque — et alors rien n’est créé', async () => {
    const idee = await creer({ title: 'Idée' });
    const engagee = await creer({ title: 'Engagée', status: 'Brouillon' });
    const rangee = await creer({ title: 'Rangée' });
    const autre = await json(await console_('/api/series', 'POST', { titre: 'Autre' }));
    // Depuis la v2.36, la série ne passe plus par le PATCH : le déplacement seul l'écrit.
    await console_(`/api/contents/${rangee.id}/deplacer`, 'POST', { serieId: autre.serie.id });

    const cas: [string[], number, RegExp][] = [
      [[idee.id, engagee.id], 409, /On ne regroupe que des idées : « Engagée » \(Brouillon\)/],
      [[idee.id, rangee.id], 409, /Déjà dans une série : « Rangée »/],
      [[idee.id, 'inconnu'], 404, /introuvable : inconnu/],
    ];
    for (const [ids, statut, motif] of cas) {
      const res = await mcp('/api/series/regrouper', 'POST', { titre: 'x', contenus: ids.map((id) => ({ id })) });
      expect(res.status, ids.join()).toBe(statut);
      expect((await json(res)).error).toMatch(motif);
    }
    expect((await json(await console_('/api/series'))).items.map((s: any) => s.titre)).toEqual(['Autre']);
    expect((await json(await console_(`/api/contents/${idee.id}`))).content.serieId).toBeNull();
  });

  it('au moins deux idées, vingt au plus, chacune une fois', async () => {
    const a = await creer();
    for (const contenus of [[{ id: a.id }], [{ id: a.id }, { id: a.id }], Array.from({ length: 21 }, (_, i) => ({ id: `i${i}` }))]) {
      expect((await mcp('/api/series/regrouper', 'POST', { titre: 'x', contenus })).status).toBe(400);
    }
  });

  it('la console peut s’en servir aussi', async () => {
    const [a, b] = [await creer(), await creer()];
    expect((await console_('/api/series/regrouper', 'POST', { titre: 'x', contenus: [{ id: a.id }, { id: b.id }] })).status).toBe(201);
  });
});

describe('NORMATIF — déplacer un contenu et réordonner une série (v2.36)', () => {
  it('le jeton du serveur MCP ouvre les deux routes', async () => {
    const [a, b] = [await creer({ title: 'A' }), await creer({ title: 'B' })];
    const { serie } = await json(await console_('/api/series/regrouper', 'POST', { titre: 'x', contenus: [{ id: a.id }, { id: b.id }] }));
    const reordonne = await mcp(`/api/series/${serie.id}/reordonner`, 'POST', { ids: [b.id, a.id] });
    expect(reordonne.status).toBe(200);
    expect((await json(reordonne)).contents.map((c: any) => [c.title, c.seriePosition])).toEqual([['B', 1], ['A', 2]]);
    const sorti = await mcp(`/api/contents/${a.id}/deplacer`, 'POST', { serieId: null });
    expect(sorti.status).toBe(200);
    expect((await json(sorti)).content.serieId).toBeNull();
  });

  it('le PATCH du serveur MCP reste refusé sur la série et le rang', async () => {
    const c = await creer();
    for (const champs of [{ serieId: 's1' }, { seriePosition: 1 }]) {
      expect((await mcp(`/api/contents/${c.id}`, 'PATCH', champs)).status).toBe(403);
    }
  });
});
