/**
 * Routes des séries (SPEC §3.3).
 *
 * Une série et ses contenus se lisent en UNE requête chacune, jamais en N+1
 * (SPEC §3.6) — c'est précisément ce que Notion ne permettait pas.
 */
import { Hono } from 'hono';
import { CreateSerieSchema, UpdateSerieSchema, SyncQuerySchema, DeleteSerieQuerySchema } from '@luminose/shared';
import type { Env } from '../env';
import { now, newId, rowToSerie, rowToContent, buildUpdate, COLUMN_MAPS, toSql } from '../db';

export const series = new Hono<{ Bindings: Env }>();

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
