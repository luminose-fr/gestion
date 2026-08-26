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
  /** Rang dans la série. Positif : une série se compte à partir de 1. */
  seriePosition: z.number().int().positive().nullable(),
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
  /** Ce que l'appel a coûté, quand le fournisseur l'a déclaré (SPEC §2.6). */
  promptTokens: z.number().int().nonnegative().nullable().optional(),
  completionTokens: z.number().int().nonnegative().nullable().optional(),
  costUsd: z.number().nonnegative().nullable().optional(),
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
  }))
    .min(1)
    /**
     * Au moins un message doit porter du CONTENU, pas seulement exister.
     *
     * Une conversation d'un seul message vide passait cette frontière et
     * arrivait chez le fournisseur, qui l'écartait et se retrouvait avec zéro
     * message : « messages: at least one message is required », renvoyé depuis
     * trois couches plus loin. Le refuser ici rend le diagnostic immédiat, et
     * dans la bonne langue.
     */
    .refine(
      (messages) => messages.some(m => m.content.trim().length > 0),
      { message: 'Au moins un message doit porter du contenu : un tour vide est écarté par les fournisseurs.' },
    ),
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

// ── Clés des fournisseurs ────────────────────────────────────────────────

/**
 * Une clé d'API posée depuis l'administration. Bornée par prudence : une
 * chaîne de 10 Ko dans ce champ n'est pas une clé, c'est un accident — ou pire.
 */
export const SetProviderKeySchema = z.object({
  apiKey: z.string().trim().min(8).max(500),
});

/** Modèle affecté à une action ; `null` remet l'action sur le modèle actif. */
export const SetActionModelSchema = z.object({
  modelId: z.string().trim().min(1).nullable(),
});

// ── Suppression d'une série ──────────────────────────────────────────────

/**
 * Ce qu'on fait des publications quand la série disparaît.
 *
 * `detacher` est le DÉFAUT, et il le reste : supprimer un regroupement ne doit
 * jamais emporter le travail qu'il regroupait par accident. La cascade se
 * demande explicitement.
 */
export const MODES_SUPPRESSION_SERIE = ['detacher', 'supprimer'] as const;
export type ModeSuppressionSerie = (typeof MODES_SUPPRESSION_SERIE)[number];

export const DeleteSerieQuerySchema = z.object({
  contenus: z.enum(MODES_SUPPRESSION_SERIE).default('detacher'),
});

// ── État des listes (tri et filtre retenus) ──────────────────────────────

/**
 * Les listes dont on retient le tri. L'identifiant est celui de l'onglet, pas
 * celui d'un composant : c'est ce que Florent voit, et deux onglets qui
 * partagent le même tableau gardent chacun leur tri.
 */
export const VUES = ['ideas', 'drafts', 'ready', 'archive', 'series'] as const;
export type VueId = (typeof VUES)[number];

/**
 * Ce qu'une liste retient d'une visite à l'autre.
 *
 * `tri` n'est PAS une énumération, volontairement. Les colonnes appartiennent à
 * l'écran et bougent avec lui ; un réglage qui désigne une colonne disparue doit
 * retomber sur le tri par défaut, pas faire échouer l'écriture d'après. Le front
 * valide donc `tri` contre ses propres colonnes, et le Worker n'en garde que la
 * forme.
 */
export const EtatDeVueSchema = z.object({
  tri: z.string().trim().min(1).max(40),
  sens: z.enum(['asc', 'desc']),
  /** Le filtre actif, quand la liste en a un. `null` = aucun filtre. */
  filtre: z.string().trim().min(1).max(40).nullable().default(null),
});

export type EtatDeVue = z.infer<typeof EtatDeVueSchema>;

// ── Corpus : où en est chaque surface ────────────────────────────────────

/**
 * Les surfaces qui portent un contexte Luminose, et qu'il faut recoller à la
 * main quand le corpus bouge.
 *
 * Le projet Claude y figure bien qu'il se synchronise depuis GitHub : sa
 * ligne sert à afficher qu'il est à jour tout seul, ce qui est une
 * information — et évite de se demander chaque fois s'il a été oublié.
 */
export const SURFACES = ['projet-claude', 'gpt', 'gem', 'claude-code', 'api'] as const;
export type Surface = (typeof SURFACES)[number];

/**
 * Ce qu'une surface porte aujourd'hui.
 *
 * On enregistre le hash au moment du collage, jamais l'inverse : c'est
 * l'écart entre ce hash et le hash courant du même profil qui dit qu'une
 * surface a décroché. Comparer un profil à un autre n'aurait aucun sens —
 * un GPT qui ne porte que le noyau ne doit pas passer pour périmé parce que
 * `strategie/` a bougé.
 */
export const PoseSchema = z.object({
  /** Le profil composé qui a été collé — noyau, complet, strategie. */
  profil: z.string().trim().min(1).max(40),
  /** Le hash rendu par le Worker au moment du collage. */
  hash: z.string().trim().regex(/^[0-9a-f]{8}$/, 'Empreinte attendue : 8 caractères hexadécimaux.'),
});

export type Pose = z.infer<typeof PoseSchema>;

// ── Inbox : capturer sans ranger ─────────────────────────────────────────

/**
 * Une capture : trois champs, pas plus.
 *
 * Ce sont les trois seules choses que Florent est seul à pouvoir fournir. Le
 * reste — quel bloc, quel statut, quoi d'autre est impacté — se dérive au
 * moment de l'intégration, qui est une revue d'impact et pas une écriture.
 */
export const CaptureSchema = z.object({
  /** Ce qui a été décidé, dans ses mots. Jamais reformulé. */
  decide: z.string().trim().min(1).max(4000),
  /**
   * Ce que ça rend faux. `null` veut dire « je ne sais pas », JAMAIS « rien » —
   * la même distinction que les colonnes de coût (SPEC §2.6). Une chaîne vide
   * est donc ramenée à null : « je n'ai pas répondu » n'est pas « il n'y a rien ».
   */
  remplace: z.string().trim().max(4000).nullable().default(null)
    .transform((v) => (v === '' ? null : v)),
  source: z.string().trim().max(200).nullable().default(null),
});

export type Capture = z.infer<typeof CaptureSchema>;

/** Marquer une capture intégrée : où est-elle partie ? */
export const IntegrationSchema = z.object({
  integration: z.string().trim().min(1).max(1000),
});

// ── Synchronisation ──────────────────────────────────────────────────────

/** `since` en epoch ms ; au-delà, les lignes supprimées remontent aussi (SPEC §8). */
export const SyncQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().optional(),
});
