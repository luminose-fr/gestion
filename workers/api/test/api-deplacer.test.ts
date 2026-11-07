/**
 * Déplacer un contenu entre séries, et réordonner une série (SPEC §3.3, v2.36).
 * Vraie migration, vrai SQLite : les rangs se vérifient en base.
 *
 * Ce que ces tests protègent : des rangs continus — 1 à n, sans trou ni
 * doublon — dans la série quittée comme dans celle d'arrivée ; un contenu
 * publié qui ne bouge pas ; une liste incomplète refusée avec la liste
 * attendue ; et une opération qui passe entière, ou pas du tout.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { makeEnv, TestD1 } from './helpers/d1';

let env: ReturnType<typeof makeEnv>;
let token: string;

const call = (path: string, init: RequestInit = {}) =>
  app.fetch(new Request(`https://api.test${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Session-Token': token, ...(init.headers || {}) },
  }), env as any);

const post = (p: string, b: unknown) => call(p, { method: 'POST', body: JSON.stringify(b) });
const json = async (r: Response) => await r.json() as any;
const db = () => env.DB as unknown as TestD1;

beforeEach(async () => {
  env = makeEnv();
  token = await createSessionToken(env);
});

const serie = async (titre: string) => (await json(await post('/api/series', { titre }))).serie;
const contenu = async (champs: Record<string, unknown>) => (await json(await post('/api/contents', champs))).content;

/** Une série et ses publications, rangées 1 à n dans l'ordre donné. */
const serieAvec = async (titre: string, titres: string[], statut = 'Brouillon') => {
  const s = await serie(titre);
  const contenus = [];
  for (const [i, t] of titres.entries()) {
    contenus.push(await contenu({ title: t, status: statut, serieId: s.id, seriePosition: i + 1, angle: `angle ${t}` }));
  }
  return { serie: s, contenus };
};

/** La série telle que la base la range : [titre, rang]. */
const rangs = (serieId: string) =>
  db().query(
    `SELECT title, serie_position FROM contents WHERE serie_id = ? AND deleted_at IS NULL
      ORDER BY serie_position IS NULL, serie_position, created_at, rowid`, serieId,
  ).map((r) => [r.title, r.serie_position]);

const deplacer = (id: string, corps: Record<string, unknown>) => post(`/api/contents/${id}/deplacer`, corps);
const reordonner = (serieId: string, ids: string[]) => post(`/api/series/${serieId}/reordonner`, { ids });

describe('NORMATIF — déplacer un contenu vers une autre série', () => {
  it('en dernier par défaut : les deux séries restent continues, et rien d’autre ne change', async () => {
    const a = await serieAvec('Série A', ['A1', 'A2', 'A3']);
    const b = await serieAvec('Série B', ['B1', 'B2']);
    const a2 = a.contenus[1];
    await call(`/api/contents/${a2.id}`, { method: 'PATCH', body: JSON.stringify({ notes: 'Ma matière', draft: '{"format":"Post Texte"}' }) });

    const res = await deplacer(a2.id, { serieId: b.serie.id });
    expect(res.status).toBe(200);
    const r = await json(res);
    expect(r.inchange).toBe(false);
    expect(r.geste).toBe('Déplacé de « Série A » n° 2 vers « Série B » n° 3.');
    expect(r.depart.contents.map((c: any) => [c.title, c.seriePosition])).toEqual([['A1', 1], ['A3', 2]]);
    expect(r.arrivee.contents.map((c: any) => [c.title, c.seriePosition])).toEqual([['B1', 1], ['B2', 2], ['A2', 3]]);

    expect(rangs(a.serie.id)).toEqual([['A1', 1], ['A3', 2]]);
    expect(rangs(b.serie.id)).toEqual([['B1', 1], ['B2', 2], ['A2', 3]]);
    // La fiche, les notes, le brouillon et l'angle restent ceux du contenu.
    expect(r.content).toMatchObject({ title: 'A2', status: 'Brouillon', notes: 'Ma matière', draft: '{"format":"Post Texte"}', angle: 'angle A2' });
  });

  it('à une position donnée : en tête, ou au milieu', async () => {
    const a = await serieAvec('Série A', ['A1', 'A2']);
    const b = await serieAvec('Série B', ['B1', 'B2', 'B3']);

    await deplacer(a.contenus[0].id, { serieId: b.serie.id, position: 1 });
    expect(rangs(b.serie.id)).toEqual([['A1', 1], ['B1', 2], ['B2', 3], ['B3', 4]]);
    await deplacer(a.contenus[1].id, { serieId: b.serie.id, position: 3 });
    expect(rangs(b.serie.id)).toEqual([['A1', 1], ['B1', 2], ['A2', 3], ['B2', 4], ['B3', 5]]);
    // Vidée, la série reste : la supprimer se décide à part.
    expect(rangs(a.serie.id)).toEqual([]);
    expect((await json(await call(`/api/series/${a.serie.id}`))).serie.titre).toBe('Série A');
  });

  it('un nouvel angle remplace l’ancien ; absent, l’angle reste tel quel', async () => {
    const a = await serieAvec('Série A', ['A1', 'A2']);
    const b = await serie('Série B');
    const r = await json(await deplacer(a.contenus[0].id, { serieId: b.id, angle: 'Ouvrir B' }));
    expect(r.content.angle).toBe('Ouvrir B');
    const r2 = await json(await deplacer(a.contenus[1].id, { serieId: b.id }));
    expect(r2.content.angle).toBe('angle A2');
  });

  it('dans sa propre série, à un autre rang', async () => {
    const a = await serieAvec('Série A', ['A1', 'A2', 'A3', 'A4']);
    const r = await json(await deplacer(a.contenus[3].id, { serieId: a.serie.id, position: 2 }));
    expect(r.geste).toBe('Déplacé du n° 4 au n° 2 dans « Série A ».');
    expect(r.arrivee).toBeNull();
    expect(r.depart.contents.map((c: any) => c.title)).toEqual(['A1', 'A4', 'A2', 'A3']);
    expect(rangs(a.serie.id)).toEqual([['A1', 1], ['A4', 2], ['A2', 3], ['A3', 4]]);
  });

  it('un contenu sans série y entre ; une idée aussi', async () => {
    const b = await serieAvec('Série B', ['B1']);
    const idee = await contenu({ title: 'Idée libre', status: 'Idée' });
    const r = await json(await deplacer(idee.id, { serieId: b.serie.id, position: 1 }));
    expect(r.geste).toBe('Rangé dans « Série B » n° 1.');
    expect(r.depart).toBeNull();
    expect(rangs(b.serie.id)).toEqual([['Idée libre', 1], ['B1', 2]]);
  });

  it('remet en ordre ce qu’elle touche : un trou, un doublon, un contenu sans rang', async () => {
    const a = await serie('Série A');
    for (const [t, rang] of [['Un', 1], ['Trois', 3], ['Trois bis', 3], ['Sans rang', null]] as const) {
      await contenu({ title: t, status: 'Brouillon', serieId: a.id, seriePosition: rang });
    }
    const autre = await contenu({ title: 'Arrivant', status: 'Brouillon' });
    await deplacer(autre.id, { serieId: a.id, position: 2 });
    expect(rangs(a.id)).toEqual([['Un', 1], ['Arrivant', 2], ['Trois', 3], ['Trois bis', 4], ['Sans rang', 5]]);
  });
});

describe('NORMATIF — sortir un contenu de sa série', () => {
  it('il devient sans série, garde son angle, et la série se resserre', async () => {
    const a = await serieAvec('Série A', ['A1', 'A2', 'A3']);
    const r = await json(await deplacer(a.contenus[0].id, { serieId: null }));
    expect(r.geste).toBe('Sorti de la série « Série A » (n° 1).');
    expect(r.content).toMatchObject({ serieId: null, seriePosition: null, angle: 'angle A1' });
    expect(r.arrivee).toBeNull();
    expect(rangs(a.serie.id)).toEqual([['A2', 1], ['A3', 2]]);
  });

  it('angle: null l’efface, à la demande', async () => {
    const a = await serieAvec('Série A', ['A1']);
    expect((await json(await deplacer(a.contenus[0].id, { serieId: null, angle: null }))).content.angle).toBeNull();
  });
});

describe('NORMATIF — ce qui est refusé, et ce qui ne fait rien', () => {
  it('un contenu publié ne se déplace pas : refus explicite, et rien ne change', async () => {
    const a = await serieAvec('Série A', ['Publié', 'A2']);
    await call(`/api/contents/${a.contenus[0].id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Publié' }) });
    const b = await serie('Série B');
    for (const corps of [{ serieId: b.id }, { serieId: null }, { serieId: a.serie.id, position: 2 }]) {
      const res = await deplacer(a.contenus[0].id, corps);
      expect(res.status).toBe(409);
      expect((await json(res)).error).toBe('« Publié » est publié : sa série fait partie de l\'historique de publication, il ne se déplace plus.');
    }
    expect(rangs(a.serie.id)).toEqual([['Publié', 1], ['A2', 2]]);
  });

  it('une série introuvable, une position hors bornes, une position sans série', async () => {
    const a = await serieAvec('Série A', ['A1', 'A2']);
    const c = await contenu({ title: 'Libre', status: 'Brouillon' });

    const introuvable = await deplacer(c.id, { serieId: 'inconnue' });
    expect(introuvable.status).toBe(404);
    expect((await json(introuvable)).error).toBe('Série introuvable : inconnue.');

    const loin = await deplacer(c.id, { serieId: a.serie.id, position: 4 });
    expect(loin.status).toBe(400);
    expect((await json(loin)).error).toBe('Position 4 impossible : sans ce contenu, « Série A » compte 2 publications — la position va de 1 à 3.');

    expect((await deplacer(c.id, { serieId: null, position: 1 })).status).toBe(400);
    expect((await deplacer('inconnu', { serieId: null })).status).toBe(404);
    expect(rangs(a.serie.id)).toEqual([['A1', 1], ['A2', 2]]);
  });

  it('à la même place, sans autre angle : rien n’est écrit, aucun geste', async () => {
    const a = await serieAvec('Série A', ['A1', 'A2']);
    const avant = db().query('SELECT updated_at FROM contents WHERE id = ?', a.contenus[1].id)[0].updated_at;
    const r = await json(await deplacer(a.contenus[1].id, { serieId: a.serie.id }));
    expect(r).toMatchObject({ inchange: true, geste: null });
    expect(db().query('SELECT updated_at FROM contents WHERE id = ?', a.contenus[1].id)[0].updated_at).toBe(avant);
    expect(db().query('SELECT COUNT(*) AS n FROM gestes')[0].n).toBe(0);
  });

  it('seul l’angle change : il s’écrit, sans geste ni renumérotation — sans position, il reste à sa place', async () => {
    const a = await serieAvec('Série A', ['A1', 'A2']);
    const r = await json(await deplacer(a.contenus[0].id, { serieId: a.serie.id, angle: 'Nouvel angle' }));
    expect(r).toMatchObject({ inchange: false, geste: null });
    expect(r.content.angle).toBe('Nouvel angle');
    expect(rangs(a.serie.id)).toEqual([['A1', 1], ['A2', 2]]);
    expect(db().query('SELECT COUNT(*) AS n FROM gestes')[0].n).toBe(0);
  });
});

describe('NORMATIF — atomique : tout passe, ou rien', () => {
  it('si le geste ne s’écrit pas, ni le contenu ni les rangs ne bougent', async () => {
    const a = await serieAvec('Série A', ['A1', 'A2', 'A3']);
    const b = await serieAvec('Série B', ['B1']);
    // Une panne au dernier pas du batch : l'écriture du geste.
    db().query(`CREATE TRIGGER panne BEFORE INSERT ON gestes BEGIN SELECT RAISE(ABORT, 'panne'); END`);

    const res = await deplacer(a.contenus[0].id, { serieId: b.serie.id, position: 1, angle: 'Autre' });
    expect(res.status).toBe(500);
    expect(rangs(a.serie.id)).toEqual([['A1', 1], ['A2', 2], ['A3', 3]]);
    expect(rangs(b.serie.id)).toEqual([['B1', 1]]);
    expect(db().query('SELECT angle FROM contents WHERE id = ?', a.contenus[0].id)[0].angle).toBe('angle A1');
  });
});

describe('NORMATIF — le geste du déplacement, dans le fil', () => {
  it('daté, avec d’où et vers où, les titres figés ; le statut, lui, ne change pas', async () => {
    const a = await serieAvec('Série A', ['A1', 'A2']);
    const b = await serie('Série B');
    await deplacer(a.contenus[1].id, { serieId: b.id });
    // Renommer la série ensuite ne réécrit pas l'histoire.
    await call(`/api/series/${b.id}`, { method: 'PATCH', body: JSON.stringify({ titre: 'Série B renommée' }) });

    const { gestes } = await json(await call(`/api/contents/${a.contenus[1].id}`));
    expect(gestes).toEqual([expect.objectContaining({
      statut: 'Brouillon', avant: 'Brouillon', nature: 'deplacement',
      detail: { de: { serieId: a.serie.id, titre: 'Série A', rang: 2 }, vers: { serieId: b.id, titre: 'Série B', rang: 1 } },
      texte: 'Déplacé de « Série A » n° 2 vers « Série B » n° 1.',
    })]);

    const { contenus } = await json(await call('/api/contents/fils'));
    expect(contenus[a.contenus[1].id].dernier).toMatchObject({
      source: 'geste', nature: 'deplacement', texte: 'Déplacé de « Série A » n° 2 vers « Série B » n° 1.',
    });
  });

  it('un changement de statut garde sa forme d’avant, sans nature ni détail', async () => {
    const c = await contenu({ title: 'x', status: 'Brouillon' });
    await call(`/api/contents/${c.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Prêt' }) });
    const { gestes } = await json(await call(`/api/contents/${c.id}`));
    expect(gestes).toEqual([{ statut: 'Prêt', avant: 'Brouillon', le: expect.any(Number) }]);
    expect(db().query('SELECT nature, detail FROM gestes')).toEqual([{ nature: 'statut', detail: null }]);
  });
});

describe('NORMATIF — le PATCH ne déplace plus', () => {
  it('la série et le rang envoyés avec le contenu entier sont ignorés ; le reste s’écrit', async () => {
    const a = await serieAvec('Série A', ['A1', 'A2']);
    const b = await serie('Série B');
    // Ce que fait l'éditeur resté ouvert : il renvoie le contenu entier, avec une série et un rang périmés.
    const res = await call(`/api/contents/${a.contenus[0].id}`, {
      method: 'PATCH', body: JSON.stringify({ ...a.contenus[0], serieId: b.id, seriePosition: 7, notes: 'Frappe' }),
    });
    expect(res.status).toBe(200);
    expect((await json(res)).content).toMatchObject({ serieId: a.serie.id, seriePosition: 1, notes: 'Frappe' });
  });
});

describe('NORMATIF — réordonner une série', () => {
  it('l’ordre complet donné devient l’ordre de la série, sans geste', async () => {
    const a = await serieAvec('Série A', ['A1', 'A2', 'A3']);
    const [a1, a2, a3] = a.contenus;
    const res = await reordonner(a.serie.id, [a3.id, a1.id, a2.id]);
    expect(res.status).toBe(200);
    const r = await json(res);
    expect(r.serie.id).toBe(a.serie.id);
    expect(r.contents.map((c: any) => [c.title, c.seriePosition])).toEqual([['A3', 1], ['A1', 2], ['A2', 3]]);
    expect(rangs(a.serie.id)).toEqual([['A3', 1], ['A1', 2], ['A2', 3]]);
    expect(db().query('SELECT COUNT(*) AS n FROM gestes')[0].n).toBe(0);
  });

  it('un contenu publié y garde sa série, et son rang suit l’ordre donné', async () => {
    const a = await serieAvec('Série A', ['A1', 'A2']);
    await call(`/api/contents/${a.contenus[0].id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Publié' }) });
    expect((await reordonner(a.serie.id, [a.contenus[1].id, a.contenus[0].id])).status).toBe(200);
    expect(rangs(a.serie.id)).toEqual([['A2', 1], ['A1', 2]]);
  });

  it('une liste incomplète, étrangère ou en double est refusée avec la liste attendue — et rien ne bouge', async () => {
    const a = await serieAvec('Série A', ['A1', 'A2']);
    const [a1, a2] = a.contenus;
    const libre = await contenu({ title: 'Libre' });
    const attendue = `Liste attendue : 1. « A1 » (${a1.id}) ; 2. « A2 » (${a2.id}).`;

    for (const [ids, ecart] of [
      [[a2.id], 'manque « A1 »'],
      [[a2.id, a1.id, libre.id], `hors de la série : ${libre.id}`],
      [[a2.id, a1.id, a2.id], `en double : ${a2.id}`],
    ] as const) {
      const res = await reordonner(a.serie.id, [...ids]);
      expect(res.status, ecart).toBe(409);
      expect((await json(res)).error).toBe(`L'ordre doit nommer les 2 publications de « Série A », chacune une fois — ${ecart}. ${attendue}`);
    }
    expect(rangs(a.serie.id)).toEqual([['A1', 1], ['A2', 2]]);
  });

  it('une série introuvable, une liste vide', async () => {
    expect((await reordonner('inconnue', ['x'])).status).toBe(404);
    const a = await serieAvec('Série A', ['A1']);
    expect((await reordonner(a.serie.id, [])).status).toBe(400);
  });
});

describe('NORMATIF — supprimer une publication resserre sa série', () => {
  it('le trou se comble ; un contenu sans série se supprime comme avant', async () => {
    const a = await serieAvec('Série A', ['A1', 'A2', 'A3']);
    const res = await call(`/api/contents/${a.contenus[1].id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(rangs(a.serie.id)).toEqual([['A1', 1], ['A3', 2]]);

    const libre = await contenu({ title: 'Libre' });
    expect((await call(`/api/contents/${libre.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await call(`/api/contents/${libre.id}`, { method: 'DELETE' })).status).toBe(404);
    expect(rangs(a.serie.id)).toEqual([['A1', 1], ['A3', 2]]);
  });
});
