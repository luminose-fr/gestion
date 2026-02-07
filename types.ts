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
  // Nouveaux champs Interview
  interviewAnswers?: string;
  interviewQuestions?: string;
}

export interface ContextItem {
  id: string;
  name: string; // e.g., "LinkedIn Professionnel"
  description: string; // The actual prompt context
}

export interface AppSettings {
  // Config moved to config.ts
  // Settings can now store UI preferences if needed in the future
  lastUsedContextId?: string;
}