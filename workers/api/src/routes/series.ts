/**
 * Routes des séries (SPEC §3.3).
 *
 * Une série et ses contenus se lisent en UNE requête chacune, jamais en N+1
 * (SPEC §3.6) — c'est précisément ce que Notion ne permettait pas.
 */
import { Hono } from 'hono';
import { CreateSerieSchema, UpdateSerieSchema, SyncQuerySchema, DeleteSerieQuerySchema, RegrouperSchema } from '@luminose/shared';
import type { Contexte } from '../env';
import { now, newId, rowToSerie, rowToContent, buildUpdate, COLUMN_MAPS, toSql } from '../db';
import { Refus } from '../refus';

export const series = new Hono<Contexte>();

/** 1 requête. Mêmes règles de synchronisation que les contenus (SPEC §8). */
series.get('/', async (c) => {
  const { since } = SyncQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));

  const { results } = since === undefined
    ? await c.env.DB.prepare('SELECT * FROM series WHERE deleted_at IS NULL ORDER BY updated_at DESC').all()
    : await c.env.DB.prepare('SELECT * FROM series WHERE updated_at > ? ORDER BY updated_at DESC').bind(since).all();

  return c.json({ items: results.map(rowToSerie), syncedAt: now() });
});

/** 2 requêtes : la série, puis ses contenus. */
series.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM series WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'Série introuvable' }, 404);

  const { results } = await c.env.DB
    // La série se lit dans l'ordre de sa progression ; une publication sans
    // rang (rattachée à la main) ferme la marche plutôt que de s'intercaler.
    .prepare('SELECT * FROM contents WHERE serie_id = ? AND deleted_at IS NULL ORDER BY serie_position IS NULL, serie_position ASC, created_at ASC')
    .bind(id).all();

  return c.json({ serie: rowToSerie(row), contents: results.map(rowToContent) });
});

series.post('/', async (c) => {
  const input = CreateSerieSchema.parse(await c.req.json());
  const ts = now();
  const id = newId();

  await c.env.DB.prepare(
    `INSERT INTO series (id, titre, intention, statut, source_content_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, input.titre, toSql(input.intention ?? null), input.statut ?? 'en_cours',
         toSql(input.sourceContentId ?? null), ts, ts).run();

  const row = await c.env.DB.prepare('SELECT * FROM series WHERE id = ?').bind(id).first();
  return c.json({ serie: rowToSerie(row) }, 201);
});

/**
 * Regrouper des idées en une série (SPEC §3.3, v2.34) — une série sans source,
 * dont les publications existent déjà. Le plan de série crée ses publications ;
 * ici, elles étaient des idées éparses, et le regroupement les range dans
 * l'ordre donné, qui est la progression (§2.9).
 *
 * Seulement des idées, et seulement des idées libres : une publication déjà
 * engagée a été pensée seule, et une idée déjà rangée appartient à une autre
 * progression — l'en sortir se décide dans la console. Les idées restent des
 * idées : leur format, leur angle et leur objectif restent à décider.
 *
 * 5 requêtes : lire les idées ; créer la série et les y ranger, dans un batch —
 * la série et ses idées existent ensemble ou pas du tout ; relire les deux.
 */
series.post('/regrouper', async (c) => {
  const { titre, intention, contenus } = RegrouperSchema.parse(await c.req.json());
  const ids = contenus.map((x) => x.id);
  const marques = ids.map(() => '?').join(', ');

  const { results } = await c.env.DB
    .prepare(`SELECT id, title, status, serie_id FROM contents WHERE deleted_at IS NULL AND id IN (${marques})`)
    .bind(...ids).all();
  const lus = new Map((results as any[]).map((r) => [String(r.id), r]));

  const manquants = ids.filter((id) => !lus.has(id));
  if (manquants.length > 0) throw new Refus(`Contenu introuvable : ${manquants.join(', ')}.`, 404);
  const engages = ids.map((id) => lus.get(id)).filter((r) => r.status !== 'Idée');
  if (engages.length > 0) {
    throw new Refus(`On ne regroupe que des idées : ${engages.map((r) => `« ${r.title} » (${r.status})`).join(', ')}.`, 409);
  }
  const ranges = ids.map((id) => lus.get(id)).filter((r) => r.serie_id);
  if (ranges.length > 0) {
    throw new Refus(`Déjà dans une série : ${ranges.map((r) => `« ${r.title} »`).join(', ')}. L'en détacher d'abord, dans la console.`, 409);
  }

  const ts = now();
  const serieId = newId();
  const angles = contenus.filter((x) => x.angle !== undefined);
  // Les rangs sont des entiers écrits par ce code ; seuls les identifiants et les angles se lient.
  const rangs = ids.map((_, i) => `WHEN ? THEN ${i + 1}`).join(' ');
  const angle = angles.length > 0 ? `, angle = CASE id ${angles.map(() => 'WHEN ? THEN ?').join(' ')} ELSE angle END` : '';

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO series (id, titre, intention, statut, source_content_id, created_at, updated_at)
       VALUES (?, ?, ?, 'en_cours', NULL, ?, ?)`
    ).bind(serieId, titre, toSql(intention ?? null), ts, ts),
    c.env.DB.prepare(
      `UPDATE contents SET serie_id = ?, serie_position = CASE id ${rangs} END${angle}, updated_at = ?
        WHERE id IN (${marques}) AND deleted_at IS NULL`
    ).bind(serieId, ...ids, ...angles.flatMap((x) => [x.id, x.angle!]), ts, ...ids),
  ]);

  const serie = await c.env.DB.prepare('SELECT * FROM series WHERE id = ?').bind(serieId).first();
  const { results: rangees } = await c.env.DB
    .prepare('SELECT * FROM contents WHERE serie_id = ? AND deleted_at IS NULL ORDER BY serie_position ASC')
    .bind(serieId).all();
  return c.json({ serie: rowToSerie(serie), contents: rangees.map(rowToContent) }, 201);
});

series.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const update = buildUpdate(UpdateSerieSchema.parse(await c.req.json()), COLUMN_MAPS.serie);
  if (!update) return c.json({ updated: false });

  const ts = now();
  const res = await c.env.DB
    .prepare(`UPDATE series SET ${update.sql}, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
    .bind(...update.params, ts, id).run();

  if (!res.meta.changes) return c.json({ error: 'Série introuvable' }, 404);

  const row = await c.env.DB.prepare('SELECT * FROM series WHERE id = ?').bind(id).first();
  return c.json({ serie: rowToSerie(row) });
});

/**
 * Suppression logique, et ce qu'on fait des publications (SPEC §3.3).
 *
 * `?contenus=detacher` — le DÉFAUT — les laisse vivre, simplement détachées :
 * supprimer un regroupement ne doit jamais emporter le travail qu'il regroupait
 * par accident. Leur rang part avec le rattachement, sinon elles gardent une
 * place dans une progression qui n'existe plus ; leur `angle`, lui, reste — c'est
 * de la matière éditoriale, pas de la structure.
 *
 * `?contenus=supprimer` emporte les publications avec la série. C'est le cas où
 * la série ENTIÈRE était une fausse piste : sans lui, il fallait supprimer les
 * publications une par une avant d'atteindre la série.
 *
 * Le CONTENU PILIER n'est jamais emporté : il n'a pas de `serie_id` (il
 * préexiste à la série qu'il a fait naître, SPEC §6.3). Une déclinaison ratée ne
 * détruit pas l'article dont elle est partie.
 *
 * 2 requêtes, dans un batch : la série et ses publications tombent ensemble ou
 * pas du tout.
 */
series.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const { contenus } = DeleteSerieQuerySchema.parse({ contenus: c.req.query('contenus') ?? undefined });
  const ts = now();

  const surLesContenus = contenus === 'supprimer'
    ? c.env.DB
        .prepare('UPDATE contents SET deleted_at = ?, updated_at = ? WHERE serie_id = ? AND deleted_at IS NULL')
        .bind(ts, ts, id)
    : c.env.DB
        .prepare('UPDATE contents SET serie_id = NULL, serie_position = NULL, updated_at = ? WHERE serie_id = ? AND deleted_at IS NULL')
        .bind(ts, id);

  const results = await c.env.DB.batch([
    c.env.DB.prepare('UPDATE series SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .bind(ts, ts, id),
    surLesContenus,
  ]);

  if (!results[0].meta.changes) return c.json({ error: 'Série introuvable' }, 404);

  const touches = results[1].meta.changes;
  return c.json({
    deleted: true,
    detachedContents: contenus === 'supprimer' ? 0 : touches,
    deletedContents: contenus === 'supprimer' ? touches : 0,
  });
});
