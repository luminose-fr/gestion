/**
 * Routes du catalogue de modèles IA (SPEC §3.4).
 *
 * `provider` désigne l'adaptateur à appeler, `vendor` sert à l'affichage
 * (SPEC §5.3). La route de test arrive en phase 6 avec packages/ai.
 */
import { Hono } from 'hono';
import { CreateModelSchema, UpdateModelSchema } from '@luminose/shared';
import type { Env } from '../env';
import { now, newId, rowToModel, buildUpdate, COLUMN_MAPS, toSql } from '../db';

export const models = new Hono<{ Bindings: Env }>();

models.get('/', async (c) => {
  const { results } = await c.env.DB
    .prepare('SELECT * FROM ai_models WHERE deleted_at IS NULL ORDER BY name ASC').all();
  return c.json({ items: results.map(rowToModel) });
});

/**
 * Un seul modèle par défaut : le marquer démarque les autres, dans le même
 * batch. Sans ça, deux modèles « par défaut » finiraient par coexister.
 */
const clearOtherDefaults = (db: D1Database, id: string, ts: number) =>
  db.prepare('UPDATE ai_models SET is_default = 0, updated_at = ? WHERE id != ? AND is_default = 1')
    .bind(ts, id);

models.post('/', async (c) => {
  const input = CreateModelSchema.parse(await c.req.json());
  const ts = now();
  const id = newId();

  const insert = c.env.DB.prepare(
    `INSERT INTO ai_models (id, name, api_code, provider, vendor, cost, strengths,
       best_use_cases, text_quality, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, input.name, input.apiCode, input.provider ?? 'onemin',
         toSql(input.vendor ?? null), toSql(input.cost ?? null), toSql(input.strengths ?? null),
         toSql(input.bestUseCases ?? null), toSql(input.textQuality ?? null),
         input.isDefault ? 1 : 0, ts, ts);

  await c.env.DB.batch(input.isDefault ? [insert, clearOtherDefaults(c.env.DB, id, ts)] : [insert]);

  const row = await c.env.DB.prepare('SELECT * FROM ai_models WHERE id = ?').bind(id).first();
  return c.json({ model: rowToModel(row) }, 201);
});

models.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const input = UpdateModelSchema.parse(await c.req.json());
  const update = buildUpdate(input, COLUMN_MAPS.model);
  if (!update) return c.json({ updated: false });

  const ts = now();
  const statements = [
    c.env.DB.prepare(`UPDATE ai_models SET ${update.sql}, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
      .bind(...update.params, ts, id),
  ];
  if (input.isDefault) statements.push(clearOtherDefaults(c.env.DB, id, ts));

  const results = await c.env.DB.batch(statements);
  if (!results[0].meta.changes) return c.json({ error: 'Modèle introuvable' }, 404);

  const row = await c.env.DB.prepare('SELECT * FROM ai_models WHERE id = ?').bind(id).first();
  return c.json({ model: rowToModel(row) });
});

models.delete('/:id', async (c) => {
  const ts = now();
  const res = await c.env.DB
    .prepare('UPDATE ai_models SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
    .bind(ts, ts, c.req.param('id')).run();

  if (!res.meta.changes) return c.json({ error: 'Modèle introuvable' }, 404);
  return c.json({ deleted: true });
});
