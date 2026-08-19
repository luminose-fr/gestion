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

// Le vocabulaire éditorial (Verdict, TargetFormat, Objectif, Profondeur et
// leurs gardes) vit dans @luminose/editorial : c'est de la méthode, pas du
// stockage. Réexporté ici pour que le reste de l'app garde un point d'entrée
// unique sur ses types.
export {
  Verdict, TargetFormat, Objectif, Profondeur,
  TARGET_FORMAT_VALUES, OBJECTIF_VALUES, PROFONDEUR_VALUES,
  isTargetFormat, isObjectif, isProfondeur,
} from '@luminose/editorial';
import type { TargetFormat, Objectif, Profondeur, Verdict } from '@luminose/editorial';
export interface AIModel {
  id: string;
  name: string;
  apiCode: string;
  cost: 'very_high' | 'high' | 'medium' | 'low_medium' | 'low';
  strengths: string;
  provider: string;
  bestUseCases: string;
  textQuality: number;
  /** Modèle marqué « Défaut » dans Notion — sert de valeur initiale au sélecteur global. */
  isDefault?: boolean;
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
  /**
   * Brief verrouillé (JSON sérialisé), généré au "Go Éditeur" par le Verrouilleur.
   * C'est la matière UNIQUE du Rédacteur quand il est présent — la session brute
   * ne lui est alors plus transmise (les idées écartées ne ressuscitent plus).
   */
  brief?: string | null;
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
  createdAt: string; // ISO string — date de création de la page Notion
  // Champs Analyse IA
  analyzed?: boolean;
  verdict?: Verdict;
  strategicAngle?: string;
  targetFormat?: TargetFormat | null;
  objectif?: Objectif | null;
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

export interface DisplayPrefs {
  showVerdictStripe: boolean;
  showPlatforms: boolean;
  showDepth: boolean;
  showObjectif: boolean;
}

export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  showVerdictStripe: true,
  showPlatforms: true,
  showDepth: true,
  showObjectif: true,
};

export interface AppSettings {
  lastUsedContextId?: string;
  displayPrefs?: DisplayPrefs;
  /** Modèle IA actif/par défaut (apiCode ou modèle interne). */
  activeModelId?: string;
}
