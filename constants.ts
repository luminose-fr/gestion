import { ContentStatus, Platform } from "./types";

export const WORKER_URL = "https://gestion-luminose-worker.luminose.workers.dev";

/** Site public de Florent — inséré dans les CTA des posts. */
export const SITE_URL = "https://www.luminose.fr";

/**
 * Slide de signature ajoutée automatiquement en fin de carrousel (côté code,
 * jamais générée par l'IA — donc zéro dérive). Sert de rappel/matière pour la
 * slide finale montée dans Sketch avec la photo de Florent.
 * → Personnaliser le texte ici si besoin.
 */
export const SIGNATURE_SLIDE = {
  titre: "Florent Jaouali",
  texte: "Psychopraticien transpersonnel",
};

export const STATUS_COLORS: Record<ContentStatus, string> = {
  [ContentStatus.IDEA]: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
  // Draft uses Brand/Blue tones
  [ContentStatus.DRAFTING]: "bg-brand-light text-brand-main border-brand-border dark:bg-dark-sec-bg dark:text-white dark:border-dark-sec-border",
  // Ready uses Green tones
  [ContentStatus.READY]: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  // Published uses Purple/Dark tones
  [ContentStatus.PUBLISHED]: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
};