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
  SyncQuerySchema, type CoachSession, type ResumeFil, type ResumeFils, type DernierDuFil,
} from '@luminose/shared';
import { getFormatDef, getFormatPromptTemplate, isTargetFormat, parseDraftResponse } from '@luminose/editorial';
import type { Contexte } from '../env';
import {
  now, newId, rowToContent, rowToCoachMessage, rowToGeneration,
  buildUpdate, COLUMN_MAPS, toSql,
} from '../db';
import { LIBELLE_EN_PLACE, LIBELLE_MCP, exigerFiche } from '../acces-mcp';
import { Refus } from '../refus';

export const contents = new Hono<Contexte>();

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

  const syncedAt = now() - 1;
  const { results } = since === undefined
    ? await c.env.DB.prepare(`SELECT ${C} FROM contents WHERE deleted_at IS NULL ORDER BY updated_at DESC`).all()
    : await c.env.DB.prepare(`SELECT ${C} FROM contents WHERE updated_at > ? ORDER BY updated_at DESC`).bind(since).all();

  return c.json({ items: results.map(rowToContent), syncedAt });
});

// ── Le fil, résumé pour les listes (SPEC §13.7) ─────────────────────────

/** Un extrait suffit à la liste : un brouillon entier ne voyage pas pour une ligne. */
const EXTRAIT = 240;

/** Le rang du plus récent, par contenu. `rowid` départage deux écritures de la même milliseconde. */
const PLUS_RECENT = 'ROW_NUMBER() OVER (PARTITION BY content_id ORDER BY created_at DESC, rowid DESC)';

/** Les contenus vivants : un contenu supprimé n'a plus de ligne dans aucune liste. */
const VIVANTS = 'content_id IN (SELECT id FROM contents WHERE deleted_at IS NULL)';

/**
 * Ce que chaque liste doit savoir du fil d'un contenu sans l'ouvrir : où en
 * est l'atelier, ce que dit la dernière relecture et si elle vise le brouillon
 * d'aujourd'hui, et le dernier fait — message, production ou geste.
 *
 * 1 batch de 6 lectures, quel que soit le nombre de contenus (SPEC §3.6) : sans
 * lui, la liste Conversations aurait coûté une requête par ligne.
 *
 * Une charge illisible ne doit pas emporter la liste entière : `json_valid`
 * garde chaque `json_extract`, qui lèverait sur un JSON abîmé.
 */
contents.get('/fils', async (c) => {
  const db = c.env.DB;
  const [comptes, coach, dates, relectures, productions, gestes] = await db.batch([
    db.prepare(
      `SELECT content_id, COUNT(*) AS n, SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END) AS tours
         FROM coach_messages WHERE deleted_at IS NULL AND ${VIVANTS} GROUP BY content_id`),
    db.prepare(
      `SELECT content_id, role, substr(content, 1, ${EXTRAIT}) AS texte, created_at FROM (
         SELECT content_id, role, content, created_at, ${PLUS_RECENT} AS rang
           FROM coach_messages WHERE deleted_at IS NULL AND ${VIVANTS}
       ) WHERE rang = 1`),
    db.prepare(
      `SELECT content_id,
              MAX(CASE WHEN target = 'draft' THEN created_at END) AS brouillon_le,
              MAX(CASE WHEN target = 'slides' THEN created_at END) AS slides_le
         FROM generations WHERE ${VIVANTS} GROUP BY content_id`),
    db.prepare(
      `SELECT content_id, created_at,
              CASE WHEN json_valid(payload) THEN json_extract(payload, '$.verdict') END AS verdict,
              CASE WHEN json_valid(payload) THEN
                COALESCE(json_array_length(payload, '$.problemes'), 0)
                + (SELECT COUNT(*) FROM json_each(payload, '$.controles') WHERE json_extract(value, '$.statut') = 'KO')
              ELSE 0 END AS points
         FROM (SELECT content_id, payload, created_at, ${PLUS_RECENT} AS rang
                 FROM generations WHERE kind = 'cold_read' AND ${VIVANTS})
        WHERE rang = 1`),
    db.prepare(
      `SELECT content_id, kind, created_at, substr(instruction, 1, ${EXTRAIT}) AS instruction,
              CASE WHEN kind = 'cold_read' AND json_valid(payload) THEN json_extract(payload, '$.verdict') END AS verdict,
              CASE WHEN kind = 'cold_read' AND json_valid(payload)
                   THEN substr(json_extract(payload, '$.lecture_naive.sujet'), 1, ${EXTRAIT}) END AS sujet
         FROM (SELECT content_id, kind, instruction, payload, created_at, ${PLUS_RECENT} AS rang
                 FROM generations WHERE ${VIVANTS})
        WHERE rang = 1`),
    db.prepare(
      `SELECT content_id, statut, avant, created_at FROM (
         SELECT content_id, statut, avant, created_at, ${PLUS_RECENT} AS rang FROM gestes WHERE ${VIVANTS}
       ) WHERE rang = 1`),
  ]);

  const resume: ResumeFils = { contenus: {} };
  const fil = (id: string): ResumeFil => resume.contenus[id] ??= {
    messages: 0, tours: 0, relecture: null, brouillonLe: null, slidesLe: null, dernier: null,
  };
  const lignes = (r: D1Result) => (r.results ?? []) as any[];
  /** Le plus récent des trois l'emporte ; à égalité, le premier arrivé reste. */
  const proposer = (id: string, dernier: DernierDuFil) => {
    const f = fil(id);
    if (!f.dernier || dernier.le > f.dernier.le) f.dernier = dernier;
  };

  for (const r of lignes(comptes)) Object.assign(fil(r.content_id), { messages: Number(r.n), tours: Number(r.tours ?? 0) });
  for (const r of lignes(dates)) Object.assign(fil(r.content_id), { brouillonLe: r.brouillon_le ?? null, slidesLe: r.slides_le ?? null });
  for (const r of lignes(relectures)) {
    fil(r.content_id).relecture = { verdict: r.verdict ?? null, points: Number(r.points ?? 0), le: r.created_at };
  }
  for (const r of lignes(coach)) {
    proposer(r.content_id, { source: 'coach', nature: r.role, texte: r.texte ?? null, verdict: null, avant: null, le: r.created_at });
  }
  for (const r of lignes(productions)) {
    proposer(r.content_id, {
      source: 'journal', nature: r.kind, texte: r.instruction ?? r.sujet ?? null,
      verdict: r.verdict ?? null, avant: null, le: r.created_at,
    });
  }
  for (const r of lignes(gestes)) {
    proposer(r.content_id, { source: 'geste', nature: r.statut, texte: null, verdict: null, avant: r.avant, le: r.created_at });
  }

  return c.json(resume);
});

// ── Détail ───────────────────────────────────────────────────────────────

/**
 * 4 requêtes : le contenu, ses messages Coach, l'agrégat de son coût, et ses
 * gestes — que le fil affiche à leur date (SPEC §13.6).
 */
contents.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT ${C} FROM contents WHERE id = ?`).bind(id).first();
  if (!row) return c.json({ error: 'Contenu introuvable' }, 404);

  // `rowid` départage : un tour de Coach écrit le message de Florent puis
  // celui de l'assistant, parfois dans la même milliseconde. Trier sur
  // `created_at` seul rendrait alors l'ordre de la conversation indéterminé.
  const { results } = await c.env.DB
    .prepare('SELECT * FROM coach_messages WHERE content_id = ? AND deleted_at IS NULL ORDER BY created_at ASC, rowid ASC')
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

  /**
   * Ce que ce contenu a coûté en IA (SPEC §2.6).
   *
   * Une SEULE requête d'agrégat, pas la lecture du journal : additionner trois
   * nombres ne justifie pas de transporter des charges utiles de plusieurs
   * kilo-octets chacune. `COUNT` compte les appels chiffrés — pas les lignes,
   * dont certaines (une reprise, un fournisseur muet) ne coûtent rien ou ne
   * disent rien.
   */
  const cout = await c.env.DB.prepare(
    `SELECT COUNT(*) AS appels,
            SUM(prompt_tokens)     AS entree,
            SUM(completion_tokens) AS sortie,
            SUM(cost_usd)          AS usd,
            SUM(CASE WHEN cost_usd IS NULL THEN 1 ELSE 0 END) AS sansPrix
       FROM generations
      WHERE content_id = ?`
  ).bind(id).first();

  const { results: gestes } = await c.env.DB
    .prepare('SELECT statut, avant, created_at FROM gestes WHERE content_id = ? ORDER BY created_at ASC, rowid ASC')
    .bind(id).all();

  return c.json({
    content,
    coachSession,
    // Le serveur MCP écrit un brouillon sans le Rédacteur : il lui faut la forme
    // que l'éditeur attend, celle que le Rédacteur reçoit dans son prompt.
    ...(c.get('appelant') === 'mcp' && isTargetFormat(content.targetFormat)
      ? { gabaritBrouillon: getFormatPromptTemplate(content.targetFormat) }
      : {}),
    gestes: (gestes as any[]).map((g) => ({ statut: g.statut, avant: g.avant, le: g.created_at })),
    cout: {
      appels: Number(cout?.appels ?? 0),
      tokensEntree: cout?.entree === null || cout?.entree === undefined ? null : Number(cout.entree),
      tokensSortie: cout?.sortie === null || cout?.sortie === undefined ? null : Number(cout.sortie),
      usd: cout?.usd === null || cout?.usd === undefined ? null : Number(cout.usd),
      // Combien d'appels n'ont pas de prix : sans ce chiffre, un total partiel
      // se lirait comme un total.
      appelsSansPrix: Number(cout?.sansPrix ?? 0),
    },
  });
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
  if (c.get('appelant') === 'mcp') exigerFiche(input);
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

/**
 * 2 requêtes : mise à jour puis relecture — 3 quand le statut change, parce
 * que le geste s'écrit dans le même batch (SPEC §13.6). Il s'écrit ICI et non
 * dans l'écran : aucun bouton, présent ou à venir, ne peut l'oublier. Un statut
 * renvoyé tel quel n'est pas un geste : l'`INSERT` ne retient que ce qui change.
 */
contents.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const input = UpdateContentSchema.parse(await c.req.json());
  if (c.get('appelant') === 'mcp') exigerFiche(input);
  const ts = now();

  const update = buildUpdate(input, COLUMN_MAPS.content);

  if (!update) {
    const row = await c.env.DB.prepare(`SELECT ${C} FROM contents WHERE id = ?`).bind(id).first();
    if (!row) return c.json({ error: 'Contenu introuvable' }, 404);
    return c.json({ content: rowToContent(row) });
  }

  const sets = [update.sql, 'updated_at = MAX(updated_at + 1, ?)'];
  const params = [...update.params, ts, id];

  const miseAJour = c.env.DB
    .prepare(`UPDATE contents SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`)
    .bind(...params);

  // Le geste se lit AVANT la mise à jour : c'est elle qui effacerait le statut d'avant.
  const res = input.status === undefined
    ? await miseAJour.run()
    : (await c.env.DB.batch([
        c.env.DB.prepare(
          `INSERT INTO gestes (id, content_id, statut, avant, created_at)
           SELECT ?, id, ?, status, ? FROM contents WHERE id = ? AND deleted_at IS NULL AND status != ?`,
        ).bind(newId(), input.status, ts, id, input.status),
        miseAJour,
      ]))[1];

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

/**
 * 2 requêtes. Réinitialise la session Coach : la conversation sort de la vue,
 * l'état repart à zéro.
 *
 * Pourquoi cette route existe : l'atelier était un aller SANS RETOUR. Une fois
 * `validated`, le chat passait en lecture seule pour toujours — et si la
 * rédaction qui suit échouait, la publication devenait intouchable. Il fallait
 * une porte de sortie.
 *
 * Les messages sont SOFT-DELETED : on jette une session parce qu'elle s'est mal
 * passée, c'est-à-dire au moment précis où l'on voudra peut-être relire ce qui
 * a été dit.
 */
contents.delete('/:id/coach', async (c) => {
  const id = c.req.param('id');
  const ts = now();

  const existe = await c.env.DB
    .prepare('SELECT id FROM contents WHERE id = ? AND deleted_at IS NULL')
    .bind(id).first();
  if (!existe) return c.json({ error: 'Contenu introuvable' }, 404);

  const [messages] = await c.env.DB.batch([
    c.env.DB.prepare('UPDATE coach_messages SET deleted_at = ? WHERE content_id = ? AND deleted_at IS NULL')
      .bind(ts, id),
    c.env.DB.prepare(
      `UPDATE contents SET coach_status = NULL, coach_brief = NULL, coach_validated_at = NULL,
                           coach_format_cible = NULL, updated_at = ?
       WHERE id = ?`
    ).bind(ts, id),
  ]);

  return c.json({ reset: true, messages: messages.meta.changes ?? 0 });
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
  const params = new URL(c.req.url).searchParams;
  const kind = params.get('kind');

  /**
   * Une borne, parce qu'un `payload` est un brouillon entier : trente
   * générations font des centaines de kilo-octets pour une question qui n'en
   * demandait souvent qu'une (« la dernière relecture à froid »).
   */
  const demande = Number(params.get('limit'));
  const limite = Number.isFinite(demande) && demande > 0 ? Math.min(demande, 200) : 50;

  const sql = kind
    ? 'SELECT * FROM generations WHERE content_id = ? AND kind = ? ORDER BY created_at DESC, rowid DESC LIMIT ?'
    : 'SELECT * FROM generations WHERE content_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?';
  const bindings = kind ? [c.req.param('id'), kind, limite] : [c.req.param('id'), limite];

  const { results } = await c.env.DB.prepare(sql).bind(...bindings).all();
  return c.json({ generations: results.map(rowToGeneration) });
});

/**
 * Un brouillon écrit par le serveur MCP (SPEC §7, v2.34) : le seul usage du
 * journal qui lui soit ouvert. Il passe ici plutôt que par PATCH pour rester
 * une génération — datée, signée, annulable depuis l'éditeur.
 *
 * Il subit la vérification d'une rédaction de l'IA (`parseDraftResponse`) et
 * doit être au format du contenu : un brouillon d'un autre format s'ouvrirait
 * dans le mauvais onglet. La provenance est posée ICI, jamais reprise de la
 * requête : le serveur MCP ne peut pas signer du nom d'un modèle du catalogue.
 *
 * L'éditeur enregistre une retouche à la main par PATCH, hors du journal. Le
 * brouillon en place, s'il n'est pas la dernière production journalisée, y est
 * donc versé d'abord (`enPlace`) : sans quoi le brouillon de Claude
 * l'effacerait, et « annuler » ne ramènerait que la rédaction d'avant la
 * retouche.
 *
 * 1 requête — le contenu et la dernière production qui vise son brouillon.
 * `null` : contenu introuvable.
 */
type Generation = ReturnType<typeof CreateGenerationSchema.parse>;
const brouillonDuMcp = async (
  db: D1Database,
  contentId: string,
  input: Generation,
): Promise<{ input: Generation; enPlace: string | null } | null> => {
  if (input.kind !== 'draft' || input.target !== 'draft' || !input.apply) {
    throw new Refus("Le serveur MCP n'écrit au journal que des brouillons, appliqués au contenu.", 403);
  }
  if (!input.instruction?.trim()) {
    throw new Refus('Dire pourquoi ce brouillon : la raison est exigée du serveur MCP, elle apparaît dans le fil du contenu.', 400);
  }
  const row = await db.prepare(
    `SELECT c.target_format, c.draft,
            (SELECT g.payload FROM generations g WHERE g.content_id = c.id AND g.target = 'draft'
              ORDER BY g.created_at DESC, g.rowid DESC LIMIT 1) AS dernier
       FROM contents c WHERE c.id = ? AND c.deleted_at IS NULL`,
  ).bind(contentId).first<{ target_format: string | null; draft: string | null; dernier: string | null }>();
  if (!row) return null;
  if (!row.target_format) {
    throw new Refus("Le contenu n'a pas de format : le poser d'abord sur sa fiche, puis écrire le brouillon.", 409);
  }

  let charge: string;
  try {
    charge = parseDraftResponse(input.payload);
  } catch (e: any) {
    throw new Refus(`Brouillon refusé : ${e?.message ?? 'illisible'}`, 400);
  }
  const format = getFormatDef(JSON.parse(charge).format)?.key;
  if (format !== row.target_format) {
    throw new Refus(`Brouillon refusé : il est au format « ${format ?? JSON.parse(charge).format} », le contenu attend « ${row.target_format} ».`, 400);
  }
  return {
    input: {
      ...input, payload: charge, modelLabel: LIBELLE_MCP, modelId: null,
      promptTokens: null, completionTokens: null, costUsd: null,
    },
    enPlace: row.draft && row.draft !== row.dernier ? row.draft : null,
  };
};

/**
 * Journalise une production, et écrit la colonne visée si `apply`.
 * 1 batch de 2 écritures — les deux passent ou aucune : le contenu ne peut pas
 * porter une valeur dont la provenance manque.
 */
contents.post('/:id/generations', async (c) => {
  const contentId = c.req.param('id');
  let input = CreateGenerationSchema.parse(await c.req.json());
  let enPlace: string | null = null;
  if (c.get('appelant') === 'mcp') {
    const verifie = await brouillonDuMcp(c.env.DB, contentId, input);
    if (!verifie) return c.json({ error: 'Contenu introuvable' }, 404);
    ({ input, enPlace } = verifie);
  }
  const ts = now();
  const id = newId();

  const insert = c.env.DB.prepare(
    `INSERT INTO generations (id, content_id, kind, target, model_id, model_label, instruction, payload,
                              prompt_tokens, completion_tokens, cost_usd, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, contentId, input.kind, toSql(input.target ?? null), toSql(input.modelId ?? null),
    input.modelLabel, toSql(input.instruction ?? null), input.payload,
    toSql(input.promptTokens ?? null), toSql(input.completionTokens ?? null), toSql(input.costUsd ?? null),
    ts
  );

  const statements = [insert];
  if (enPlace) {
    // Une milliseconde plus tôt : dans l'historique, la version en place précède celle qui la remplace.
    statements.unshift(c.env.DB.prepare(
      `INSERT INTO generations (id, content_id, kind, target, model_id, model_label, instruction, payload, created_at)
       VALUES (?, ?, 'draft', 'draft', NULL, ?, ?, ?, ?)`
    ).bind(newId(), contentId, LIBELLE_EN_PLACE,
           `Mise au journal avant le brouillon de ${LIBELLE_MCP} : elle n'y figurait pas.`, enPlace, ts - 1));
  }
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
