export enum Platform {
  FACEBOOK = "Facebook",
  INSTAGRAM = "Instagram",
  LINKEDIN = "LinkedIn",
  GMB = "Google My Business",
  YOUTUBE = "Youtube",
  BLOG = "Blog",
  NEWSLETTER = "Newsletter"
}

export enum ContentStatus {
  IDEA = "Idée",
  DRAFTING = "Brouillon",
  READY = "Prêt",
  PUBLISHED = "Publié"
}

export enum Verdict {
  VALID = "Valide",
  TOO_BLAND = "Trop lisse",
  NEEDS_WORK = "À revoir"
}

export enum TargetFormat {
  POST_TEXTE_COURT = "Post Texte (Court)",
  ARTICLE_LONG_SEO = "Article (Long/SEO)",
  SCRIPT_VIDEO_REEL_SHORT = "Script Vidéo (Reel/Short)",
  SCRIPT_VIDEO_YOUTUBE = "Script Vidéo (Youtube)",
  CARROUSEL_SLIDE = "Carrousel (Slide par Slide)",
  PROMPT_IMAGE = "Prompt Image",
  NEWSLETTER = "Newsletter"
}

export const TARGET_FORMAT_VALUES = Object.values(TargetFormat) as string[];

export const isTargetFormat = (value: unknown): value is TargetFormat => {
  return typeof value === "string" && TARGET_FORMAT_VALUES.includes(value);
};

export enum ContextUsage {
  REDACTEUR = "Rédacteur",
  ANALYSTE = "Analyste",
  INTERVIEWER = "Interviewer",
  ARTISTE = "Artiste"
}

export const CONTEXT_USAGE_VALUES = Object.values(ContextUsage) as string[];

export const isContextUsage = (value: unknown): value is ContextUsage => {
  return typeof value === "string" && CONTEXT_USAGE_VALUES.includes(value);
};

export enum TargetOffer {
  STANDARD = "Standard",
  TRANSVERSE = "Transverse",
  SEUIL = "Seuil"
}

export const TARGET_OFFER_VALUES = Object.values(TargetOffer) as string[];

export const isTargetOffer = (value: unknown): value is TargetOffer => {
  return typeof value === "string" && TARGET_OFFER_VALUES.includes(value);
};

export enum Profondeur {
  DIRECT = "Direct",
  LEGERE = "Légère",
  COMPLETE = "Complète"
}

export const PROFONDEUR_VALUES = Object.values(Profondeur) as string[];

export const isProfondeur = (value: unknown): value is Profondeur => {
  return typeof value === "string" && PROFONDEUR_VALUES.includes(value);
};

export interface AIModel {
  id: string;
  name: string;
  apiCode: string;
  cost: 'very_high' | 'high' | 'medium' | 'low_medium' | 'low';
  strengths: string;
  provider: string;
  bestUseCases: string;
  textQuality: number;
}

// ── Coach Chat Session (nouvelle architecture) ───────────────────────

export interface CoachMessage {
  /** "user" = Florent, "assistant" = Coach, "system" = instruction initiale (non affichée) */
  role: 'system' | 'user' | 'assistant';
  /** Contenu texte. Pour l'assistant, c'est le champ "message" extrait du JSON ; le JSON complet est dans raw. */
  content: string;
  /** JSON brut complet retourné par l'IA (pour l'assistant) — permet de retrouver quick_replies, ready_for_editor, etc. */
  raw?: string;
  /** Quick replies proposées par le Coach à ce tour (pour l'assistant uniquement) */
  quickReplies?: string[];
  /** Le Coach estime que la matière est prête pour l'Éditeur (pour l'assistant uniquement) */
  readyForEditor?: boolean;
  /** ISO timestamp */
  timestamp: string;
}

export interface CoachSession {
  version: 1;
  formatCible: TargetFormat | null;
  messages: CoachMessage[];
  status: 'in_progress' | 'validated';
  validatedAt: string | null;
}

export interface ContentItem {
  id: string;
  title: string;
  status: ContentStatus;
  platforms: Platform[];
  body: string;
  scheduledDate: string | null; // ISO string
  notes: string; // AI Context or prompt notes
  lastEdited: string;
  // Champs Analyse IA
  analyzed?: boolean;
  verdict?: Verdict;
  strategicAngle?: string;
  targetFormat?: TargetFormat | null;
  targetOffer?: TargetOffer | null;
  justification?: string;
  suggestedMetaphor?: string;
  // Profondeur de traitement
  depth?: Profondeur;
  // Session de chat avec le Coach (nouvelle architecture)
  coachSession?: CoachSession | null;
  // Ancien flow interview (conservé pour compat legacy / migration)
  interviewAnswers?: string;
  interviewQuestions?: string;
  // Champ Slides Carrousel
  slides?: string;
  // Champ Post Court (Post Texte formaté pour copier-coller)
  postCourt?: string;
  // Champ Script Vidéo (pour formats Reel/Short et Youtube)
  scriptVideo?: string;
}

export interface ContextItem {
  id: string;
  name: string; // e.g., "LinkedIn Professionnel"
  description: string; // The actual prompt context
  usage?: ContextUsage;
}

export interface AppSettings {
  lastUsedContextId?: string;
}
