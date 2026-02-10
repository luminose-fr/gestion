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
  PROMPT_IMAGE = "Prompt Image"
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
  // Nouveaux champs Interview
  interviewAnswers?: string;
  interviewQuestions?: string;
  // Champ Slides Carrousel
  slides?: string;
  // Champ Post Court (Post Texte formaté pour copier-coller)
  postCourt?: string;
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
