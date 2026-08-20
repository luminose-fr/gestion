import { ContentStatus, Platform } from "./types";

// SITE_URL et SIGNATURE_SLIDE sont du contenu éditorial, pas de la config :
// ils vivent dans @luminose/editorial et sont réexportés ici par commodité.
export { SITE_URL, SIGNATURE_SLIDE } from "@luminose/editorial";

/**
 * Origine de l'API — VIDE, donc relative (SPEC §1.2).
 *
 * Le front est servi par Cloudflare Pages sur gestion.luminose.fr, et le
 * Worker capte /api/* sur cette même origine. Les appels partent donc en
 * `/api/...` : plus de CORS, et surtout plus d'origine figée au build — le
 * piège classique d'une URL de développement partie en production.
 *
 * En local, le proxy de vite.config.ts renvoie /api vers `wrangler dev`, ce qui
 * fait emprunter au développement exactement le même chemin qu'à la production.
 */
export const WORKER_URL = "";

/** Site public de Florent — inséré dans les CTA des posts. */



export const STATUS_COLORS: Record<ContentStatus, string> = {
  [ContentStatus.IDEA]: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
  // Draft uses Brand/Blue tones
  [ContentStatus.DRAFTING]: "bg-brand-light text-brand-main border-brand-border dark:bg-dark-sec-bg dark:text-white dark:border-dark-sec-border",
  // Ready uses Green tones
  [ContentStatus.READY]: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  // Published uses Purple/Dark tones
  [ContentStatus.PUBLISHED]: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
};