/**
 * Frontière base ↔ application.
 *
 * `snake_case` en base, `camelCase` en TypeScript (CLAUDE.md). La conversion
 * a lieu ICI et nulle part ailleurs : dispersée dans les routes, elle finit
 * toujours par diverger d'un endroit à l'autre.
 *
 * Les colonnes JSON (`platforms`, `quick_replies`) sont désérialisées au
 * passage ; les charges éditoriales (`draft`, `slides`, `payload`) restent des
 * chaînes — seul @luminose/editorial sait les lire (SPEC §2.3).
 */
import type { Content, Serie, AIModel, Generation, CoachMessage } from '@luminose/shared';

export const now = () => Date.now();
export const newId = () => crypto.randomUUID();

const bool = (v: unknown) => v === 1 || v === true;
const jsonArray = (v: unknown): string[] => {
  if (typeof v !== 'string') return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// ── Lignes → entités ─────────────────────────────────────────────────────

export const rowToContent = (r: any): Content => ({
  id: r.id,
  title: r.title ?? '',
  status: r.status,
  platforms: jsonArray(r.platforms) as Content['platforms'],
  targetFormat: r.target_format ?? null,
  objectif: r.objectif ?? null,
  depth: r.depth ?? null,
  analyzedAt: r.analyzed_at ?? null,
  verdict: r.verdict ?? null,
  strategicAngle: r.strategic_angle ?? null,
  justification: r.justification ?? null,
  suggestedMetaphor: r.suggested_metaphor ?? null,
  notes: r.notes ?? '',
  draft: r.draft ?? null,
  slides: r.slides ?? null,
  coachStatus: r.coach_status ?? null,
  coachFormatCible: r.coach_format_cible ?? null,
  coachBrief: r.coach_brief ?? null,
  coachValidatedAt: r.coach_validated_at ?? null,
  serieId: r.serie_id ?? null,
  angle: r.angle ?? null,
  seriePosition: r.serie_position ?? null,
  scheduledDate: r.scheduled_date ?? null,
  legacyJson: r.legacy_json ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at ?? null,
});

export const rowToSerie = (r: any): Serie => ({
  id: r.id,
  titre: r.titre,
  intention: r.intention ?? null,
  statut: r.statut,
  sourceContentId: r.source_content_id ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at ?? null,
});

export const rowToModel = (r: any): AIModel => ({
  id: r.id,
  name: r.name,
  apiCode: r.api_code,
  provider: r.provider ?? 'onemin',
  vendor: r.vendor ?? null,
  cost: r.cost ?? null,
  strengths: r.strengths ?? null,
  bestUseCases: r.best_use_cases ?? null,
  textQuality: r.text_quality ?? null,
  isDefault: bool(r.is_default),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at ?? null,
});

export const rowToGeneration = (r: any): Generation => ({
  id: r.id,
  contentId: r.content_id,
  kind: r.kind,
  target: r.target ?? null,
  modelId: r.model_id ?? null,
  modelLabel: r.model_label,
  instruction: r.instruction ?? null,
  payload: r.payload,
  createdAt: r.created_at,
});

export const rowToCoachMessage = (r: any): CoachMessage => ({
  id: r.id,
  contentId: r.content_id,
  role: r.role,
  content: r.content,
  raw: r.raw ?? null,
  quickReplies: jsonArray(r.quick_replies),
  readyForEditor: bool(r.ready_for_editor),
  createdAt: r.created_at,
});

// ── Entités → colonnes ───────────────────────────────────────────────────

/**
 * Correspondance des champs inscriptibles. Une clé absente de cette table ne
 * peut pas être écrite, quoi qu'envoie le client — le schéma zod l'a déjà
 * filtrée, ceci en est la seconde barrière.
 */
const CONTENT_COLUMNS: Record<string, string> = {
  title: 'title',
  status: 'status',
  analyzedAt: 'analyzed_at',
  targetFormat: 'target_format',
  objectif: 'objectif',
  depth: 'depth',
  verdict: 'verdict',
  strategicAngle: 'strategic_angle',
  justification: 'justification',
  suggestedMetaphor: 'suggested_metaphor',
  notes: 'notes',
  draft: 'draft',
  slides: 'slides',
  serieId: 'serie_id',
  angle: 'angle',
  seriePosition: 'serie_position',
  scheduledDate: 'scheduled_date',
};

const SERIE_COLUMNS: Record<string, string> = {
  titre: 'titre',
  intention: 'intention',
  statut: 'statut',
  sourceContentId: 'source_content_id',
};

const MODEL_COLUMNS: Record<string, string> = {
  name: 'name',
  apiCode: 'api_code',
  provider: 'provider',
  vendor: 'vendor',
  cost: 'cost',
  strengths: 'strengths',
  bestUseCases: 'best_use_cases',
  textQuality: 'text_quality',
  isDefault: 'is_default',
};

export const COLUMN_MAPS = {
  content: CONTENT_COLUMNS,
  serie: SERIE_COLUMNS,
  model: MODEL_COLUMNS,
};

/** Sérialise une valeur applicative pour SQLite (booléens → 0/1, tableaux → JSON). */
const toSql = (value: unknown): string | number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'number') return value;
  return String(value);
};

/**
 * Construit le fragment `SET a = ?, b = ?` d'un UPDATE partiel, et ses
 * paramètres. Retourne `null` si rien n'est à écrire — l'appelant évite alors
 * une requête inutile (SPEC §3.6).
 */
export const buildUpdate = (
  input: Record<string, unknown>,
  columns: Record<string, string>
): { sql: string; params: (string | number | null)[] } | null => {
  const parts: string[] = [];
  const params: (string | number | null)[] = [];

  for (const [key, column] of Object.entries(columns)) {
    if (!(key in input)) continue;
    parts.push(`${column} = ?`);
    params.push(toSql(input[key]));
  }

  if (parts.length === 0) return null;
  return { sql: parts.join(', '), params };
};

export { toSql };
