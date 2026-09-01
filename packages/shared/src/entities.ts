import { z } from 'zod';
import {
  TARGET_FORMAT_VALUES, OBJECTIF_VALUES, PROFONDEUR_VALUES,
} from '@luminose/editorial';

// ── Vocabulaire non éditorial ────────────────────────────────────────────

export const PLATFORMS = [
  'Facebook', 'Instagram', 'LinkedIn', 'Google My Business',
  'Youtube', 'Blog', 'Newsletter',
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const CONTENT_STATUSES = ['Idée', 'Brouillon', 'Prêt', 'Publié'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const VERDICTS = ['Valide', 'Trop lisse', 'À revoir'] as const;

export const SERIE_STATUSES = ['en_cours', 'terminee'] as const;
export type SerieStatus = (typeof SERIE_STATUSES)[number];

/** Natures de production IA journalisées (SPEC §2.6). */
export const GENERATION_KINDS = [
  'analysis', 'draft', 'slides', 'cold_read', 'adjustment', 'brief', 'plan_series',
] as const;
export type GenerationKind = (typeof GENERATION_KINDS)[number];

/** Colonne visée par une génération, quand elle en vise une. */
export const GENERATION_TARGETS = ['draft', 'slides'] as const;

export const COACH_ROLES = ['user', 'assistant'] as const;
export const COACH_STATUSES = ['in_progress', 'validated'] as const;

// ── Entités ──────────────────────────────────────────────────────────────

/**
 * Un contenu. `draft` porte le brouillon quel que soit le format (SPEC §2.5) ;
 * `draft` et `slides` sont du JSON sérialisé que seul editorial interprète.
 */
export const ContentSchema = z.object({
  id: z.string(),
  title: z.string().default(''),
  status: z.enum(CONTENT_STATUSES),
  platforms: z.array(z.enum(PLATFORMS)).default([]),
  targetFormat: z.enum(TARGET_FORMAT_VALUES as [string, ...string[]]).nullable().default(null),
  objectif: z.enum(OBJECTIF_VALUES as [string, ...string[]]).nullable().default(null),
  depth: z.enum(PROFONDEUR_VALUES as [string, ...string[]]).nullable().default(null),

  analyzedAt: z.number().int().nullable().default(null),
  verdict: z.enum(VERDICTS).nullable().default(null),
  strategicAngle: z.string().nullable().default(null),
  justification: z.string().nullable().default(null),
  suggestedMetaphor: z.string().nullable().default(null),

  notes: z.string().default(''),
  draft: z.string().nullable().default(null),
  slides: z.string().nullable().default(null),

  coachStatus: z.enum(COACH_STATUSES).nullable().default(null),
  coachFormatCible: z.string().nullable().default(null),
  coachBrief: z.string().nullable().default(null),
  coachValidatedAt: z.number().int().nullable().default(null),

  serieId: z.string().nullable().default(null),
  angle: z.string().nullable().default(null),
  /** Rang dans la série — la progression se lit dans cet ordre (SPEC §2.9). */
  seriePosition: z.number().int().nullable().default(null),

  scheduledDate: z.string().nullable().default(null),
  legacyJson: z.string().nullable().default(null),

  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  deletedAt: z.number().int().nullable().default(null),
});
export type Content = z.infer<typeof ContentSchema>;

export const SerieSchema = z.object({
  id: z.string(),
  titre: z.string(),
  intention: z.string().nullable().default(null),
  statut: z.enum(SERIE_STATUSES).default('en_cours'),
  sourceContentId: z.string().nullable().default(null),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  deletedAt: z.number().int().nullable().default(null),
});
export type Serie = z.infer<typeof SerieSchema>;

/**
 * Un modèle IA du catalogue.
 * `provider` désigne l'ADAPTATEUR à appeler, `vendor` sert à l'affichage
 * (SPEC §5.3) : un même modèle peut passer par 1min.ai puis en direct.
 */
export const AIModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  apiCode: z.string(),
  provider: z.string().default('onemin'),
  vendor: z.string().nullable().default(null),
  cost: z.string().nullable().default(null),
  strengths: z.string().nullable().default(null),
  bestUseCases: z.string().nullable().default(null),
  textQuality: z.number().int().nullable().default(null),
  isDefault: z.boolean().default(false),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  deletedAt: z.number().int().nullable().default(null),
});
export type AIModel = z.infer<typeof AIModelSchema>;

export const GenerationSchema = z.object({
  id: z.string(),
  contentId: z.string(),
  kind: z.enum(GENERATION_KINDS),
  target: z.enum(GENERATION_TARGETS).nullable().default(null),
  modelId: z.string().nullable().default(null),
  modelLabel: z.string(),
  instruction: z.string().nullable().default(null),
  payload: z.string(),
  /**
   * Ce que l'appel a coûté (SPEC §2.6). `null` = le fournisseur n'a rien
   * déclaré, ce qui n'est pas la même chose que zéro.
   */
  promptTokens: z.number().int().nullable().default(null),
  completionTokens: z.number().int().nullable().default(null),
  costUsd: z.number().nullable().default(null),
  createdAt: z.number().int(),
});
export type Generation = z.infer<typeof GenerationSchema>;

/**
 * Une ligne de la synthèse des mesures d'appels (migration 0006).
 *
 * Pas de schéma Zod : « Zod à la frontière » vaut pour ce qui ENTRE. Ceci ne
 * fait que sortir, agrégé par le Worker, et se valider soi-même n'apprendrait
 * rien à personne.
 *
 * Tout est nullable pour la raison de 0004, qui n'a pas changé : les
 * fournisseurs ne comptent pas tous. `null` veut dire « on ne sait pas »,
 * jamais « zéro » — un modèle muet n'est pas un modèle gratuit, et un débit
 * inconnu n'est pas un débit nul.
 */
export interface MesureSynthese {
  /** L'action éditoriale, ou `null` pour un appel qui n'en déclarait pas. */
  action: string | null;
  format: string | null;
  modelLabel: string;
  provider: string;
  appels: number;
  echecs: number;
  entreeMoy: number | null;
  sortieMoy: number | null;
  sortieMax: number | null;
  dureeMoyMs: number | null;
  dureeMaxMs: number | null;
  feuilleCarMoy: number | null;
  coutTotal: number | null;
  /** Jetons de sortie par seconde — ce qui sépare un modèle bavard d'un hébergeur lent. */
  jetonsParSeconde: number | null;
  /** Dernier appel de ce groupe, pour savoir si la mesure est encore d'actualité. */
  dernier: number;
}

/**
 * Un poste de consommation face au plafond du plan gratuit Cloudflare.
 *
 * `valeur` est nullable comme partout ailleurs : Cloudflare peut ne rien
 * renvoyer pour un poste (métrique trop récente, dataset momentanément muet),
 * et « on ne sait pas » ne doit jamais s'afficher « zéro » — sur un écran de
 * quotas, la confusion se lit exactement à l'envers du danger.
 */
export interface QuotaPoste {
  id: string;
  /** Le service Cloudflare — « Workers », « D1 ». */
  service: string;
  libelle: string;
  valeur: number | null;
  seuil: number;
  unite: 'requetes' | 'lignes' | 'octets';
  /** `jour` : remis à zéro à 00:00 UTC. `total` : cumulé, sans remise à zéro. */
  periode: 'jour' | 'total';
  /**
   * Pourquoi ce poste n'a pas de valeur, quand il n'en a pas.
   *
   * Un poste muet et un poste à zéro se ressemblent à l'écran ; ce champ est ce
   * qui les sépare pour de bon, en portant le message de Cloudflare jusqu'au
   * lecteur au lieu de le laisser dans les journaux du Worker.
   */
  note?: string | null;
}

export interface QuotasReponse {
  postes: QuotaPoste[];
  /** Début de la fenêtre observée, en UTC — c'est là que les compteurs repartent. */
  depuis: string;
  /** Date à laquelle les plafonds ont été relevés dans la documentation. */
  seuilsReleves: string;
}

export const CoachMessageSchema = z.object({
  id: z.string(),
  contentId: z.string(),
  role: z.enum(COACH_ROLES),
  content: z.string(),
  raw: z.string().nullable().default(null),
  quickReplies: z.array(z.string()).default([]),
  readyForEditor: z.boolean().default(false),
  createdAt: z.number().int(),
});
export type CoachMessage = z.infer<typeof CoachMessageSchema>;

/** Session Coach assemblée pour le client (SPEC §2.7) : le stockage en lignes ne remonte pas. */
export interface CoachSession {
  status: 'in_progress' | 'validated' | null;
  formatCible: string | null;
  brief: string | null;
  validatedAt: number | null;
  messages: CoachMessage[];
}

/** Message d'une conversation IA — même forme côté front, Worker et adaptateurs. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Ce qu'un appel IA a consommé — même forme côté front, Worker et adaptateurs,
 * comme `ChatMessage` (le jumeau vit dans `packages/ai/src/port.ts`, que le
 * front n'a pas le droit d'importer, SPEC §1.1).
 *
 * Tout est nullable : `null` veut dire « le fournisseur n'a rien déclaré »,
 * jamais « zéro ».
 */
export interface UsageIA {
  entree: number | null;
  sortie: number | null;
  coutUsd: number | null;
}
