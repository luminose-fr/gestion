/**
 * Schémas des ENTRÉES d'API (SPEC §3.1).
 *
 * Ce sont eux qui décident de ce qu'un client a le droit d'écrire. Les champs
 * calculés par le Worker — `createdAt`, `updatedAt`, `deletedAt`, `analyzedAt`,
 * les identifiants — n'y figurent volontairement pas : le client ne les fixe
 * jamais (SPEC §2.2).
 */
import { z } from 'zod';
import {
  CONTENT_STATUSES, PLATFORMS, VERDICTS, SERIE_STATUSES,
  GENERATION_KINDS, GENERATION_TARGETS, COACH_ROLES, COACH_STATUSES,
} from './entities';
import {
  TARGET_FORMAT_VALUES, OBJECTIF_VALUES, PROFONDEUR_VALUES,
} from '@luminose/editorial';

const enumOf = (values: readonly string[]) => z.enum(values as [string, ...string[]]);

// ── Contenus ─────────────────────────────────────────────────────────────

/** Champs qu'un client peut écrire sur un contenu. */
const contentWritable = {
  title: z.string().max(500),
  status: enumOf(CONTENT_STATUSES),
  platforms: z.array(enumOf(PLATFORMS)),
  targetFormat: enumOf(TARGET_FORMAT_VALUES).nullable(),
  objectif: enumOf(OBJECTIF_VALUES).nullable(),
  depth: enumOf(PROFONDEUR_VALUES).nullable(),
  verdict: enumOf(VERDICTS).nullable(),
  strategicAngle: z.string().nullable(),
  justification: z.string().nullable(),
  suggestedMetaphor: z.string().nullable(),
  notes: z.string(),
  draft: z.string().nullable(),
  slides: z.string().nullable(),
  serieId: z.string().nullable(),
  angle: z.string().nullable(),
  // Date seule, sans heure : la publication est multi-plateformes à un instant
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  /**
   * Date d'analyse (epoch ms), `null` si jamais analysé. Écrit par le client :
   * l'analyse a lieu chez lui, c'est lui qui sait quand. Contrairement à
   * `createdAt`/`updatedAt`, ce n'est pas un horodatage d'infrastructure.
   */
  analyzedAt: z.number().int().nullable(),
};

export const CreateContentSchema = z.object(contentWritable).partial().extend({
  status: enumOf(CONTENT_STATUSES).default('Idée'),
});
export type CreateContentInput = z.infer<typeof CreateContentSchema>;

export const UpdateContentSchema = z.object(contentWritable).partial();
export type UpdateContentInput = z.infer<typeof UpdateContentSchema>;

/** Création en lot — un plan de série (SPEC §6.3). Transactionnelle. */
export const BatchCreateContentSchema = z.object({
  items: z.array(CreateContentSchema).min(1).max(50),
});

// ── Séries ───────────────────────────────────────────────────────────────

const serieWritable = {
  titre: z.string().min(1).max(500),
  intention: z.string().nullable(),
  statut: enumOf(SERIE_STATUSES),
  sourceContentId: z.string().nullable(),
};

export const CreateSerieSchema = z.object(serieWritable).partial().required({ titre: true });
export const UpdateSerieSchema = z.object(serieWritable).partial();

// ── Modèles IA ───────────────────────────────────────────────────────────

const modelWritable = {
  name: z.string().min(1).max(200),
  apiCode: z.string().min(1).max(200),
  provider: z.string().min(1).max(50),
  vendor: z.string().nullable(),
  cost: z.string().nullable(),
  strengths: z.string().nullable(),
  bestUseCases: z.string().nullable(),
  textQuality: z.number().int().min(1).max(5).nullable(),
  isDefault: z.boolean(),
};

export const CreateModelSchema = z.object(modelWritable).partial().required({ name: true, apiCode: true });
export const UpdateModelSchema = z.object(modelWritable).partial();

// ── Coach ────────────────────────────────────────────────────────────────

export const AppendCoachMessageSchema = z.object({
  role: enumOf(COACH_ROLES),
  content: z.string(),
  raw: z.string().nullable().optional(),
  quickReplies: z.array(z.string()).optional(),
  readyForEditor: z.boolean().optional(),
});

export const UpdateCoachSchema = z.object({
  status: enumOf(COACH_STATUSES).nullable(),
  formatCible: z.string().nullable(),
  brief: z.string().nullable(),
}).partial();

// ── Générations ──────────────────────────────────────────────────────────

export const CreateGenerationSchema = z.object({
  kind: enumOf(GENERATION_KINDS),
  target: enumOf(GENERATION_TARGETS).nullable().optional(),
  modelId: z.string().nullable().optional(),
  modelLabel: z.string().min(1),
  instruction: z.string().nullable().optional(),
  payload: z.string(),
  /** Écrit aussi la colonne visée sur le contenu. Faux = journalisation seule. */
  apply: z.boolean().optional(),
});

// ── IA ───────────────────────────────────────────────────────────────────

export const ChatRequestSchema = z.object({
  modelId: z.string().min(1),
  system: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).min(1),
  json: z.boolean().optional(),
});
export type ChatRequestInput = z.infer<typeof ChatRequestSchema>;

/**
 * Sonde un code d'API AVANT enregistrement : c'est tout l'intérêt du testeur.
 * On ne passe donc pas par un modèle du catalogue, qui n'existe pas encore.
 */
export const TestModelSchema = z.object({
  apiCode: z.string().min(1),
  provider: z.string().min(1).default('onemin'),
});

// ── Synchronisation ──────────────────────────────────────────────────────

/** `since` en epoch ms ; au-delà, les lignes supprimées remontent aussi (SPEC §8). */
export const SyncQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().optional(),
});
