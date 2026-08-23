/**
 * Routes des contenus (SPEC §3.2), y compris la conversation Coach et le
 * journal des générations qui en sont des sous-ressources.
 *
 * Budget de requêtes (SPEC §3.6) : chaque route énonce le sien en commentaire.
 * Aucune ne dépend du volume de données.
 */
import { Hono } from 'hono';
import {
  CreateContentSchema, UpdateContentSchema, BatchCreateContentSchema,
  AppendCoachMessageSchema, UpdateCoachSchema, CreateGenerationSchema,
  SyncQuerySchema, type CoachSession,
} from '@luminose/shared';
import type { Env } from '../env';
import {
  now, newId, rowToContent, rowToCoachMessage, rowToGeneration,
  buildUpdate, COLUMN_MAPS, toSql,
} from '../db';

export const contents = new Hono<{ Bindings: Env }>();

/** Colonnes du contenu, listées une fois — évite les SELECT * divergents. */
const C = 'id, title, status, platforms, target_format, objectif, depth, analyzed_at, verdict, ' +
  'strategic_angle, justification, suggested_metaphor, notes, draft, slides, coach_status, ' +
  'coach_format_cible, coach_brief, coach_validated_at, serie_id, angle, serie_position, ' +
  'scheduled_date, legacy_json, created_at, updated_at, deleted_at';

// ── Liste et synchronisation ─────────────────────────────────────────────

/**
 * 1 requête. Avec `since`, renvoie AUSSI les lignes supprimées : c'est ce qui
 * permet au client de purger son cache (SPEC §8). Sans `since`, seules les
 * lignes vivantes remontent.
 */
contents.get('/', async (c) => {
  const { since } = SyncQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));

  const { results } = since === undefined
    ? await c.env.DB.prepare(`SELECT ${C} FROM contents WHERE deleted_at IS NULL ORDER BY updated_at DESC`).all()
    : await c.env.DB.prepare(`SELECT ${C} FROM contents WHERE updated_at > ? ORDER BY updated_at DESC`).bind(since).all();

  return c.json({ items: results.map(rowToContent), syncedAt: now() });
});

// ── Détail ───────────────────────────────────────────────────────────────

/** 2 requêtes : le contenu, puis ses messages Coach. */
contents.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT ${C} FROM contents WHERE id = ?`).bind(id).first();
  if (!row) return c.json({ error: 'Contenu introuvable' }, 404);

  // `rowid` départage : un tour de Coach écrit le message de Florent puis
  // celui de l'assistant, parfois dans la même milliseconde. Trier sur
  // `created_at` seul rendrait alors l'ordre de la conversation indéterminé.
  const { results } = await c.env.DB
    .prepare('SELECT * FROM coach_messages WHERE content_id = ? ORDER BY created_at ASC, rowid ASC')
    .bind(id).all();

  const content = rowToContent(row);
  // La session est ASSEMBLÉE pour le client : le stockage en lignes ne remonte
  // pas jusqu'à lui (SPEC §2.7).
  const coachSession: CoachSession = {
    status: content.coachStatus as CoachSession['status'],
    formatCible: content.coachFormatCible,
    brief: content.coachBrief,
    validatedAt: content.coachValidatedAt,
    messages: results.map(rowToCoachMessage),
  };

  return c.json({ content, coachSession });
});

// ── Écritures ────────────────────────────────────────────────────────────

/** Prépare les colonnes d'une création à partir d'une entrée validée. */
const insertStatement = (db: D1Database, input: Record<string, any>, ts: number) => {
  const id = newId();
  return {
    id,
    stmt: db.prepare(
      `INSERT INTO contents (id, title, status, platforms, target_format, objectif, depth,
         analyzed_at, verdict, strategic_angle, justification, suggested_metaphor,
         notes, draft, slides, serie_id, angle, serie_position, scheduled_date,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      input.title ?? '',
      input.status ?? 'Idée',
      JSON.stringify(input.platforms ?? []),
      toSql(input.targetFormat), toSql(input.objectif), toSql(input.depth),
      toSql(input.analyzedAt ?? null),
      toSql(input.verdict), toSql(input.strategicAngle),
      toSql(input.justification), toSql(input.suggestedMetaphor),
      input.notes ?? '',
      toSql(input.draft), toSql(input.slides),
      toSql(input.serieId), toSql(input.angle), toSql(input.seriePosition ?? null),
      toSql(input.scheduledDate), ts, ts
    ),
  };
};

/** 2 requêtes : insertion puis relecture. */
contents.post('/', async (c) => {
  const input = CreateContentSchema.parse(await c.req.json());
  const ts = now();
  const { id, stmt } = insertStatement(c.env.DB, input, ts);
  await stmt.run();

  const row = await c.env.DB.prepare(`SELECT ${C} FROM contents WHERE id = ?`).bind(id).first();
  return c.json({ content: rowToContent(row) }, 201);
});

/**
 * Création en lot — le plan de série (SPEC §6.3).
 * 1 batch transactionnel + 1 relecture : six contenus créés ou zéro, jamais
 * une série à moitié peuplée.
 */
contents.post('/batch', async (c) => {
  const { items } = BatchCreateContentSchema.parse(await c.req.json());
  const ts = now();

  const prepared = items.map((input) => insertStatement(c.env.DB, input, ts));
  await c.env.DB.batch(prepared.map((p) => p.stmt));

  const ids = prepared.map((p) => p.id);
  const { results } = await c.env.DB
    .prepare(`SELECT ${C} FROM contents WHERE id IN (${ids.map(() => '?').join(',')})`)
    .bind(...ids).all();

  return c.json({ items: results.map(rowToContent) }, 201);
});

/** 2 requêtes : mise à jour puis relecture. */
contents.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const input = UpdateContentSchema.parse(await c.req.json());
  const ts = now();

  const update = buildUpdate(input, COLUMN_MAPS.content);

  if (!update) {
    const row = await c.env.DB.prepare(`SELECT ${C} FROM contents WHERE id = ?`).bind(id).first();
    if (!row) return c.json({ error: 'Contenu introuvable' }, 404);
    return c.json({ content: rowToContent(row) });
  }

  const sets = [update.sql, 'updated_at = ?'];
  const params = [...update.params, ts, id];

  const res = await c.env.DB
    .prepare(`UPDATE contents SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`)
    .bind(...params).run();

  if (!res.meta.changes) return c.json({ error: 'Contenu introuvable' }, 404);

  const row = await c.env.DB.prepare(`SELECT ${C} FROM contents WHERE id = ?`).bind(id).first();
  return c.json({ content: rowToContent(row) });
});

/**
 * Suppression logique (SPEC §2.1). `updated_at` est bumpé pour que la
 * synchronisation incrémentale voie passer la suppression.
 */
contents.delete('/:id', async (c) => {
  const ts = now();
  const res = await c.env.DB
    .prepare('UPDATE contents SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
    .bind(ts, ts, c.req.param('id')).run();

  if (!res.meta.changes) return c.json({ error: 'Contenu introuvable' }, 404);
  return c.json({ deleted: true, deletedAt: ts });
});

// ── Conversation Coach (SPEC §2.7) ───────────────────────────────────────

/** 1 requête. Append-only : un message écrit ne se perd plus. */
contents.post('/:id/coach/messages', async (c) => {
  const contentId = c.req.param('id');
  const input = AppendCoachMessageSchema.parse(await c.req.json());
  const ts = now();
  const id = newId();

  await c.env.DB.prepare(
    `INSERT INTO coach_messages (id, content_id, role, content, raw, quick_replies, ready_for_editor, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, contentId, input.role, input.content,
    toSql(input.raw ?? null), JSON.stringify(input.quickReplies ?? []),
    input.readyForEditor ? 1 : 0, ts
  ).run();

  return c.json({ message: { id, contentId, ...input, createdAt: ts } }, 201);
});

/** 1 requête. Statut, brief verrouillé et validation de la session. */
contents.patch('/:id/coach', async (c) => {
  const input = UpdateCoachSchema.parse(await c.req.json());
  const ts = now();

  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (input.status !== undefined) {
    sets.push('coach_status = ?', 'coach_validated_at = ?');
    params.push(input.status, input.status === 'validated' ? ts : null);
  }
  if (input.formatCible !== undefined) { sets.push('coach_format_cible = ?'); params.push(input.formatCible); }
  if (input.brief !== undefined) { sets.push('coach_brief = ?'); params.push(input.brief); }

  if (sets.length === 0) return c.json({ updated: false });

  const res = await c.env.DB
    .prepare(`UPDATE contents SET ${sets.join(', ')}, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
    .bind(...params, ts, c.req.param('id')).run();

  if (!res.meta.changes) return c.json({ error: 'Contenu introuvable' }, 404);
  return c.json({ updated: true });
});

// ── Journal des générations (SPEC §2.6) ──────────────────────────────────

/**
 * 1 requête. Du plus récent au plus ancien.
 *
 * Le départage par `rowid` n'est pas cosmétique : deux générations peuvent
 * naître dans la même milliseconde — c'est le cas d'un retour arrière, écrit
 * juste après la ligne qu'il reprend. Trier sur `created_at` seul rendrait
 * alors l'ordre indéterminé, et « la génération précédente » ambiguë.
 * `rowid` est monotone à l'insertion.
 */
contents.get('/:id/generations', async (c) => {
  const kind = new URL(c.req.url).searchParams.get('kind');
  const sql = kind
    ? 'SELECT * FROM generations WHERE content_id = ? AND kind = ? ORDER BY created_at DESC, rowid DESC'
    : 'SELECT * FROM generations WHERE content_id = ? ORDER BY created_at DESC, rowid DESC';
  const bindings = kind ? [c.req.param('id'), kind] : [c.req.param('id')];

  const { results } = await c.env.DB.prepare(sql).bind(...bindings).all();
  return c.json({ generations: results.map(rowToGeneration) });
});

/**
 * Journalise une production, et écrit la colonne visée si `apply`.
 * 1 batch de 2 écritures — les deux passent ou aucune : le contenu ne peut pas
 * porter une valeur dont la provenance manque.
 */
contents.post('/:id/generations', async (c) => {
  const contentId = c.req.param('id');
  const input = CreateGenerationSchema.parse(await c.req.json());
  const ts = now();
  const id = newId();

  const insert = c.env.DB.prepare(
    `INSERT INTO generations (id, content_id, kind, target, model_id, model_label, instruction, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, contentId, input.kind, toSql(input.target ?? null), toSql(input.modelId ?? null),
    input.modelLabel, toSql(input.instruction ?? null), input.payload, ts
  );

  const statements = [insert];
  if (input.apply && input.target) {
    statements.push(
      c.env.DB.prepare(`UPDATE contents SET ${input.target} = ?, updated_at = ? WHERE id = ?`)
        .bind(input.payload, ts, contentId)
    );
  }
  await c.env.DB.batch(statements);

  return c.json({ generation: { id, contentId, ...input, createdAt: ts } }, 201);
});

/**
 * Revenir à une génération antérieure.
 * 2 requêtes. On AJOUTE une ligne dont la charge reprend celle visée, plutôt
 * que de rembobiner le journal : annuler une annulation reste possible.
 */
contents.post('/:id/generations/:genId/revert', async (c) => {
  const contentId = c.req.param('id');
  const source = await c.env.DB
    .prepare('SELECT * FROM generations WHERE id = ? AND content_id = ?')
    .bind(c.req.param('genId'), contentId).first();

  if (!source) return c.json({ error: 'Génération introuvable' }, 404);

  const gen = rowToGeneration(source);
  if (!gen.target) return c.json({ error: 'Cette génération ne vise aucune colonne' }, 400);

  const ts = now();
  const id = newId();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO generations (id, content_id, kind, target, model_id, model_label, instruction, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, contentId, gen.kind, gen.target, gen.modelId, gen.modelLabel,
           `Retour à la génération du ${new Date(gen.createdAt).toISOString()}`, gen.payload, ts),
    c.env.DB.prepare(`UPDATE contents SET ${gen.target} = ?, updated_at = ? WHERE id = ?`)
      .bind(gen.payload, ts, contentId),
  ]);

  return c.json({ reverted: true, generationId: id });
});
