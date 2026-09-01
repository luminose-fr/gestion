// Les formes stockées et transportées viennent de @luminose/shared : le front
// et le Worker parlent le même modèle, il n'y a plus de traduction entre les
// deux. Le vocabulaire éditorial, lui, vient de @luminose/editorial.
export {
  PLATFORMS, CONTENT_STATUSES, VERDICTS, SERIE_STATUSES,
  GENERATION_KINDS, COACH_ROLES, COACH_STATUSES,
} from '@luminose/shared';
export type {
  Content, Serie, AIModel, Generation, CoachMessage, CoachSession,
  SerieStatus, GenerationKind, MesureSynthese,
} from '@luminose/shared';
import type { Content } from '@luminose/shared';

/**
 * Les valeurs de statut et de plateforme, sous forme d'objet constant.
 *
 * `ContentStatus` et `Platform` sont des unions de chaînes dans
 * @luminose/shared — la bonne forme pour valider une entrée. Mais le code de
 * l'application les lit surtout comme des constantes nommées
 * (`ContentStatus.DRAFTING` se relit mieux que `'Brouillon'`), et un nom peut
 * désigner à la fois un type et une valeur.
 */
export const ContentStatus = {
  IDEA: 'Idée',
  DRAFTING: 'Brouillon',
  READY: 'Prêt',
  PUBLISHED: 'Publié',
} as const;
export type ContentStatus = (typeof ContentStatus)[keyof typeof ContentStatus];

export const Platform = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  LINKEDIN: 'LinkedIn',
  GMB: 'Google My Business',
  YOUTUBE: 'Youtube',
  BLOG: 'Blog',
  NEWSLETTER: 'Newsletter',
} as const;
export type Platform = (typeof Platform)[keyof typeof Platform];

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

// ── Coach Chat Session (nouvelle architecture) ───────────────────────



/**
 * Un contenu, tel que l'API le renvoie.
 *
 * C'est désormais @luminose/shared qui fait foi : le front et le Worker
 * parlent exactement le même modèle. Les écarts avec l'ancienne forme Notion
 * sont documentés en SPEC §2.8 —
 *   • `body` et `scriptVideo` fusionnés en `draft` (un seul brouillon)
 *   • `postCourt` supprimé : dérivé de `draft` à la lecture
 *   • `analyzed` remplacé par `analyzedAt`
 *   • `lastEdited` (ISO) remplacé par `updatedAt` (epoch ms)
 *   • la session Coach n'est plus embarquée : elle se charge à l'ouverture
 */
export type ContentItem = Content;

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
  /** Identifiant du modèle actif dans le catalogue — pas son code d'API. */
  activeModelId?: string;
}
