/**
 * Le vocabulaire de la méthode éditoriale.
 *
 * Ces valeurs ne décrivent pas un stockage : elles décrivent la façon dont
 * Florent travaille. Elles vivent donc au plus bas de la pile — c'est la
 * couche de persistance qui les importe, jamais l'inverse.
 */

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

/**
 * Objectif business d'une publication — chaque contenu en a exactement UN.
 * C'est lui qui dicte la nature du CTA (voir ai/objectives.ts).
 */
export enum Objectif {
  NOTORIETE = "Notoriété",
  RECADRAGE = "Recadrage de croyance",
  CONFIANCE = "Confiance / Preuve",
  EDUCATION = "Éducation pratique",
  TRAFIC = "Trafic contenu long",
  CONVERSION = "Conversion séance",
  EVENEMENT = "Promotion événement"
}

export const OBJECTIF_VALUES = Object.values(Objectif) as string[];

export const isObjectif = (value: unknown): value is Objectif => {
  return typeof value === "string" && OBJECTIF_VALUES.includes(value);
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

