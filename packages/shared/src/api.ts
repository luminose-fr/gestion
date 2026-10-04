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
  /**
   * L'action éditoriale à l'origine de l'appel — `DRAFT_CONTENT`, `COLD_READ`…
   *
   * **Facultatif, et c'est la marche arrière.** Absent, le Worker n'ajoute
   * rien et l'appel est identique, à l'octet près, à celui d'avant le corpus.
   * Présent, il fait précéder le prompt système de la feuille de salle du rôle
   * (`FEUILLE_PAR_ACTION`).
   *
   * Ce n'est pas le libellé humain affiché dans le bandeau d'activité — c'est
   * l'identifiant technique de l'action.
   */
  action: z.string().trim().max(60).optional(),
  /**
   * Le format visé par l'appel — `Article (long/SEO)`, `Carrousel`…
   *
   * Il ne change RIEN à ce qui part chez le fournisseur : il n'existe que pour
   * la mesure (`mesures_ia`), où il permettra de régler les budgets format par
   * format. Facultatif au même titre que `action`, et pour la même raison : un
   * appelant qui l'ignore obtient l'appel d'avant, à l'octet près.
   */
  format: z.string().trim().max(80).optional(),
});
export type ChatRequestInput = z.infer<typeof ChatRequestSchema>;

/**
 * Sonde un code d'API AVANT enregistrement : c'est tout l'intérêt du testeur.
 * On ne passe donc pas par un modèle du catalogue, qui n'existe pas encore.
 */
// ── Transcription d'une prise (SPEC §12.5) ─────────────────────────────

/**
 * Dix minutes de son mono 16 kHz en WAV 16 bits, encodées en base64 — bien
 * au-delà d'un Reel. La borne n'est pas cosmétique : le corps entier transite
 * en mémoire dans le Worker, et une prise envoyée par erreur avec sa vidéo
 * (des centaines de mégaoctets) doit être refusée ici, en clair.
 */
export const TRANSCRIPTION_BASE64_MAX = 26_000_000;

export const TranscriptionRequestSchema = z.object({
  /** Le son de la prise, en WAV, encodé en base64. Jamais la vidéo : elle ne quitte pas le navigateur. */
  audio: z.string().min(64).max(
    TRANSCRIPTION_BASE64_MAX,
    'Son trop long pour une transcription (dix minutes au plus) : seule la piste son, en mono 16 kHz, doit partir.',
  ),
  langue: z.string().regex(/^[a-z]{2}$/).default('fr'),
});
export type TranscriptionRequest = z.infer<typeof TranscriptionRequestSchema>;

/** Un mot prononcé, en secondes depuis le début du fichier. */
export interface MotTranscrit {
  mot: string;
  debut: number;
  fin: number;
}

export interface Transcription {
  mots: MotTranscrit[];
  texte: string;
  /** Durée du son selon le modèle ; `null` s'il ne l'a pas dite. */
  duree: number | null;
}

// ── Le montage, rangé chez Cloudflare (SPEC §12.4, v2.8) ────────────────

/** La prise principale, et la seconde accroche tournée pour la publicité. */
export const ROLES_PRISE = ['principale', 'accroche'] as const;
export type RolePrise = (typeof ROLES_PRISE)[number];

/**
 * Une prise s'envoie en parties de 50 Mo : le Worker refuse une requête de plus
 * de 100 Mo, et R2 exige des parties de même taille (la dernière exceptée).
 */
export const TAILLE_PARTIE = 50 * 1024 * 1024;
/** Une image de carte : large pour une photo, refusée pour une vidéo envoyée par erreur. */
export const VISUEL_MAX = 15 * 1024 * 1024;
/** Le plan gratuit de R2, affiché pour savoir quand faire de la place. */
export const R2_GRATUIT = 10 * 1000 ** 3;

export const PriseDeclareeSchema = z.object({
  nom: z.string().min(1).max(300),
  type: z.string().max(100),
  taille: z.number().int().positive().max(5 * 1000 ** 3, 'Prise de plus de 5 Go : exportez-la plus légère depuis Final Cut.'),
  duree: z.number().positive().max(3600),
  largeur: z.number().int().positive().max(10_000),
  hauteur: z.number().int().positive().max(10_000),
});
export type PriseDeclaree = z.infer<typeof PriseDeclareeSchema>;

export const FinEnvoiSchema = z.object({
  parties: z.array(z.object({
    numero: z.number().int().min(1).max(10_000),
    etag: z.string().min(1).max(200),
  })).min(1).max(10_000),
});

const MotTranscritSchema = z.object({
  mot: z.string().max(200),
  debut: z.number().min(0),
  fin: z.number().min(0),
});

export const TranscriptionSchema = z.object({
  mots: z.array(MotTranscritSchema).max(30_000),
  texte: z.string().max(400_000),
  duree: z.number().nullable(),
});

export const MajPriseSchema = z.object({
  transcription: TranscriptionSchema.optional(),
  /** `séquence:élément` → secondes dans la prise (SPEC §12.5). */
  reperes: z.record(z.string().regex(/^\d+:\d+$/), z.number().min(0).max(36_000)).optional(),
}).refine(m => m.transcription !== undefined || m.reperes !== undefined, { message: 'Rien à mettre à jour.' });

export interface PriseDistante {
  id: string;
  contentId: string;
  role: RolePrise;
  nom: string;
  type: string;
  taille: number;
  duree: number;
  largeur: number;
  hauteur: number;
  /** L'objet dans R2, neuf à chaque dépôt : c'est aussi la clé du cache local. */
  r2Cle: string;
  /** `null` tant que le fichier n'est pas entier dans R2 — un envoi interrompu. */
  pretLe: number | null;
  transcription: Transcription | null;
  transcriteLe: number | null;
  reperes: Record<string, number>;
  createdAt: number;
  updatedAt: number;
}

export interface VisuelDistant {
  id: string;
  contentId: string;
  sequence: number;
  element: number;
  /** La description à laquelle l'image répondait au dépôt. */
  description: string;
  type: string;
  taille: number;
  r2Cle: string;
  updatedAt: number;
}

export interface EtatMontage {
  prises: PriseDistante[];
  visuels: VisuelDistant[];
  stockage: {
    /** Les fichiers vivants de TOUS les contenus : c'est le plafond du compte qui compte. */
    octets: number;
    plafond: number;
    /** La liaison R2 existe ; sans elle, rien ne se dépose. */
    disponible: boolean;
  };
}

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
 *
 * L'écran déclare les siennes dans `apps/manager/components/Corpus/surfaces.ts`,
 * typées sur cette liste. Le 14/09/2026, les deux surfaces « fichier » (GPT et
 * Gem) y ont été ajoutées sans l'être ici : le fichier se téléchargeait, puis
 * le Worker refusait d'en noter le dépôt (« Surface inconnue », 404) — et la
 * ligne restait « jamais posée » pour toujours. Le typage rend ce décalage
 * impossible à compiler.
 */
export const SURFACES = [
  'projet-claude', 'gpt', 'gpt-fichier', 'gem', 'gem-fichier', 'claude-code', 'api',
] as const;
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

// ── Écriture du corpus ───────────────────────────────────────────────────

/**
 * Enregistrer une fiche du corpus — c'est-à-dire commiter sur GitHub.
 *
 * `sha` est celui lu à l'ouverture de la fiche. Il n'est pas décoratif : c'est
 * lui qui fait échouer l'écriture si le fichier a bougé entre-temps, plutôt
 * que d'écraser en silence le commit de quelqu'un d'autre — ou celui qu'on a
 * soi-même poussé depuis un autre appareil.
 */
export const SourceCorpusSchema = z.object({
  contenu: z.string().min(1).max(200_000),
  sha: z.string().trim().min(1).max(100),
  /** Le message de commit. Vide, la route en compose un depuis le chemin. */
  message: z.string().trim().max(200).optional(),
});
export type SourceCorpus = z.infer<typeof SourceCorpusSchema>;

/** Ce qui part au déploiement. Les mêmes cibles que `scripts/deploy.sh`. */
export const DeploiementSchema = z.object({
  cible: z.enum(['tout', 'api', 'app']).default('api'),
});

// ── Synchronisation ──────────────────────────────────────────────────────

/** `since` en epoch ms ; au-delà, les lignes supprimées remontent aussi (SPEC §8). */
export const SyncQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().optional(),
});
