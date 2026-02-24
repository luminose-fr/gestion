/**
 * Registre centralisé des formats de contenu.
 *
 * Ce fichier est la source unique de vérité pour tout ce qui est format-spécifique :
 * - Champ de stockage dans Notion (body, scriptVideo, slides)
 * - Tab de destination dans l'éditeur
 * - Template de production (prompt) pour le Rédacteur
 * - Extraction de texte brut (pour recherche, preview)
 * - Clé de format court (pour la détection dans les JSON IA)
 */

import { TargetFormat } from '../types';

// ── Types ────────────────────────────────────────────────────────────

export type StorageField = 'body' | 'scriptVideo' | 'slides';
export type EditorTab = 'atelier' | 'slides' | 'postcourt';

export interface FormatDefinition {
    /** Valeur exacte du TargetFormat enum */
    key: TargetFormat;
    /** Clé courte utilisée dans les JSON IA (ex: "Post Texte", "Carrousel") */
    shortKey: string;
    /** Champ ContentItem où stocker le résultat de la rédaction */
    storageField: StorageField;
    /** Tab de l'éditeur à afficher après génération */
    editorTab: EditorTab;
    /** Template de production JSON (injecté dans le prompt du Rédacteur) */
    promptTemplate: string;
    /** Extrait un texte lisible depuis les données JSON parsées */
    toPlainText: (data: any) => string;
}

// ── Helpers internes ─────────────────────────────────────────────────

const t = (v: any): string => (typeof v === 'string' ? v.trim() : '');

// ── Définitions de format ────────────────────────────────────────────

const POST_TEXTE: FormatDefinition = {
    key: TargetFormat.POST_TEXTE_COURT,
    shortKey: 'Post Texte',
    storageField: 'body',
    editorTab: 'atelier',
    promptTemplate: `
GRILLE DE PRODUCTION — Post Texte (Court) — LinkedIn, FB, Insta
{
  "format": "Post Texte",
  "hook": "1 phrase isolée, percutante. Question, affirmation paradoxale ou image choc.",
  "corps": "Paragraphes ultra-courts (1-2 phrases). Alternance prose/listes (→). Montée en tension. La métaphore filée structure le texte.",
  "baffe": "Conclusion tranchante — la vérité que le lecteur ne voulait pas entendre, dite avec tendresse.",
  "cta": "Appel à l'action (question ouverte, invitation à commenter, lien vers offre). JAMAIS d'emoji."
}
Ton : Direct, oralisé, percutant. On entend la voix.
Contrainte de longueur : 150 mots max pour le corps (hors hook et CTA).
    `.trim(),
    toPlainText: (data: any): string => {
        const out: string[] = [];
        if (data.hook) out.push(t(data.hook));
        if (data.corps) out.push(t(data.corps));
        if (data.baffe) out.push(t(data.baffe));
        if (data.cta) out.push(t(data.cta));
        return out.filter(Boolean).join(' ');
    }
};

const ARTICLE: FormatDefinition = {
    key: TargetFormat.ARTICLE_LONG_SEO,
    shortKey: 'Article',
    storageField: 'body',
    editorTab: 'atelier',
    promptTemplate: `
GRILLE DE PRODUCTION — Article (Long/SEO) — Blog, Newsletter
{
  "format": "Article",
  "titre_h1": "Titre accrocheur incluant le mot-clé principal.",
  "introduction": "Structure PAS (Problème → Agitation → Solution). 3-4 paragraphes. Pose la métaphore centrale dès l'intro.",
  "sections": [
    {
      "sous_titre_h2": "Titre structurant",
      "contenu": "Développement. Alterner rigueur clinique et images concrètes. Chaque section fait progresser vers le seuil."
    }
  ],
  "conclusion": "Récapitulatif + angle de rupture. Pas de résumé plat — une ouverture qui laisse le lecteur face à son choix.",
  "cta": "Bloc d'appel à l'action contextuel."
}
Ton : Expert, posé, pédagogique, mais garde la radicalité du Seuil et l'oralité de Florent.
    `.trim(),
    toPlainText: (data: any): string => {
        const out: string[] = [];
        if (data.titre_h1) out.push(t(data.titre_h1));
        if (data.introduction) out.push(t(data.introduction));
        (data.sections || []).forEach((s: any) => {
            if (s.sous_titre_h2) out.push(t(s.sous_titre_h2));
            if (s.contenu) out.push(t(s.contenu));
        });
        if (data.conclusion) out.push(t(data.conclusion));
        return out.filter(Boolean).join(' ');
    }
};

const SCRIPT_REEL: FormatDefinition = {
    key: TargetFormat.SCRIPT_VIDEO_REEL_SHORT,
    shortKey: 'Script Reel',
    storageField: 'scriptVideo',
    editorTab: 'atelier',
    promptTemplate: `
GRILLE DE PRODUCTION — Script Vidéo (Reel/Short) — Insta, TikTok, Shorts
{
  "format": "Script Reel",
  "contrainte": "150 mots max (60 secondes)",
  "hook": "[0-3s] Hook visuel ou verbal. La phrase qui arrête le scroll.",
  "corps": "[3-50s] Corps rythmé. Style parlé. Intentions visuelles entre crochets : [Plan serré], [Texte à l'écran], [Changement d'angle].",
  "cta": "[50-60s] CTA rapide. Question ou invitation."
}
Ton : Parlé, naturel, comme le transcript sur l'injustice. L'humour et le paradoxe sont les moteurs.
    `.trim(),
    toPlainText: (data: any): string => {
        const out: string[] = [];
        if (data.hook) out.push(t(data.hook));
        if (data.corps) out.push(t(data.corps));
        if (data.cta) out.push(t(data.cta));
        return out.filter(Boolean).join(' ');
    }
};

const SCRIPT_YOUTUBE: FormatDefinition = {
    key: TargetFormat.SCRIPT_VIDEO_YOUTUBE,
    shortKey: 'Script Youtube',
    storageField: 'scriptVideo',
    editorTab: 'atelier',
    promptTemplate: `
GRILLE DE PRODUCTION — Script Vidéo (Youtube)
{
  "format": "Script Youtube",
  "intro": "Hook + Promesse claire. Pourquoi rester jusqu'au bout.",
  "developpement": [
    {
      "point": "Titre du point",
      "contenu": "Développement narratif. Métaphores filées. Anecdotes de cabinet."
    }
  ],
  "conclusion": "Ouverture + angle de rupture. Pas de résumé mécanique."
}
Ton : Narratif, profond, utilisant des métaphores filées. Plus long, plus contemplatif, mais toujours incarné.
    `.trim(),
    toPlainText: (data: any): string => {
        const out: string[] = [];
        if (data.intro) out.push(t(data.intro));
        (data.developpement || []).forEach((s: any) => {
            if (s.contenu) out.push(t(s.contenu));
        });
        if (data.conclusion) out.push(t(data.conclusion));
        return out.filter(Boolean).join(' ');
    }
};

const CARROUSEL: FormatDefinition = {
    key: TargetFormat.CARROUSEL_SLIDE,
    shortKey: 'Carrousel',
    storageField: 'body',
    editorTab: 'atelier',
    promptTemplate: `
GRILLE DE PRODUCTION — Carrousel (Slide par Slide) — LinkedIn, Insta
STRUCTURE FIXE DU CARROUSEL (7 slides obligatoires) :
Slide 1 — Accroche : type IMAGE. Titre court (6 mots max). Texte accrocheur. L'image doit capturer le regard et poser la métaphore.
Slide 2 — Le Problème / Le Vécu : type TYPO. Fond coloré. Le lecteur se reconnaît dans la douleur décrite.
Slide 3 — La Métaphore : type IMAGE. L'image centrale du contenu, incarnée visuellement.
Slide 4 — L'Explication Clinique : type TYPO. Le mécanisme psychique nommé et traduit en vécu.
Slide 5 — Le Basculement : type TYPO. Le moment où le choix se pose : continuer ou traverser.
Slide 6 — Synthèse : type IMAGE. L'image qui cristallise la transformation.
Slide 7 — CTA : type TYPO. Appel à l'action direct, sans emoji. Question ouverte ou invitation.

FORMAT JSON ATTENDU :
{
  "format": "Carrousel",
  "slides": [
    { "numero": 1, "role": "Accroche",             "type": "IMAGE", "titre": "6 mots max", "texte": "...", "visuel": "Description de l'image suggérée" },
    { "numero": 2, "role": "Le Problème / Le Vécu", "type": "TYPO",  "titre": "...", "texte": "...", "indication_typo": "Couleur de fond et style" },
    { "numero": 3, "role": "La Métaphore",          "type": "IMAGE", "titre": "...", "texte": "...", "visuel": "Description de l'image suggérée" },
    { "numero": 4, "role": "L'Explication Clinique", "type": "TYPO",  "titre": "...", "texte": "...", "indication_typo": "Couleur de fond et style" },
    { "numero": 5, "role": "Le Basculement",        "type": "TYPO",  "titre": "...", "texte": "...", "indication_typo": "Couleur de fond et style" },
    { "numero": 6, "role": "Synthèse",              "type": "IMAGE", "titre": "...", "texte": "...", "visuel": "Description de l'image suggérée" },
    { "numero": 7, "role": "CTA",                   "type": "TYPO",  "titre": "...", "texte": "...", "indication_typo": "Couleur de fond et style" }
  ]
}
IMPORTANT : Toujours exactement 7 slides. Pas de slide_finale séparée.
    `.trim(),
    toPlainText: (data: any): string => {
        const out: string[] = [];
        (data.slides || []).forEach((s: any) => {
            if (s.titre) out.push(t(s.titre));
            if (s.texte) out.push(t(s.texte));
        });
        return out.filter(Boolean).join(' ');
    }
};

const PROMPT_IMAGE: FormatDefinition = {
    key: TargetFormat.PROMPT_IMAGE,
    shortKey: 'Prompt Image',
    storageField: 'body',
    editorTab: 'atelier',
    promptTemplate: `
GRILLE DE PRODUCTION — Prompt Image (IA Générative)
{
  "format": "Prompt Image",
  "prompt": "Prompt détaillé et artistique en anglais pour Midjourney/DALL-E illustrant la métaphore centrale.",
  "legende": "2 phrases max pour accompagner l'image sur les réseaux."
}
Interdiction absolue : Aucun autre texte.
    `.trim(),
    toPlainText: (data: any): string => {
        const out: string[] = [];
        if (data.prompt) out.push(t(data.prompt));
        if (data.legende) out.push(t(data.legende));
        return out.filter(Boolean).join(' ');
    }
};

// ── Registre ─────────────────────────────────────────────────────────

export const FORMAT_REGISTRY: Record<TargetFormat, FormatDefinition> = {
    [TargetFormat.POST_TEXTE_COURT]: POST_TEXTE,
    [TargetFormat.ARTICLE_LONG_SEO]: ARTICLE,
    [TargetFormat.SCRIPT_VIDEO_REEL_SHORT]: SCRIPT_REEL,
    [TargetFormat.SCRIPT_VIDEO_YOUTUBE]: SCRIPT_YOUTUBE,
    [TargetFormat.CARROUSEL_SLIDE]: CARROUSEL,
    [TargetFormat.PROMPT_IMAGE]: PROMPT_IMAGE,
};

// ── Lookup helpers ───────────────────────────────────────────────────

/** Clés courtes reconnues dans les JSON retournés par l'IA */
const SHORT_KEY_MAP: Record<string, TargetFormat> = {};
for (const def of Object.values(FORMAT_REGISTRY)) {
    SHORT_KEY_MAP[def.shortKey] = def.key;
}

/**
 * Retrouve la définition de format à partir du TargetFormat enum
 * OU depuis le shortKey dans un JSON IA (ex: "Post Texte", "Carrousel").
 */
export function getFormatDef(formatOrShortKey: string | undefined | null): FormatDefinition | undefined {
    if (!formatOrShortKey) return undefined;
    // Essai direct par enum value
    if (formatOrShortKey in FORMAT_REGISTRY) {
        return FORMAT_REGISTRY[formatOrShortKey as TargetFormat];
    }
    // Essai par shortKey
    const mapped = SHORT_KEY_MAP[formatOrShortKey];
    if (mapped) return FORMAT_REGISTRY[mapped];
    return undefined;
}

/**
 * Extrait un texte brut lisible depuis un body JSON structuré.
 * Remplace bodyJsonToText() — centralisé ici pour éliminer la duplication.
 */
export function bodyJsonToText(body: string): string {
    if (!body) return '';
    try {
        const lastBrace = body.lastIndexOf('}');
        const cleaned = lastBrace !== -1 ? body.slice(0, lastBrace + 1) : body;
        const data = JSON.parse(cleaned);

        // Édition manuelle libre
        if (data.edited_raw) return data.edited_raw;

        // Trouve la définition de format depuis le champ "format" du JSON
        const formatDef = getFormatDef(data.format);
        if (formatDef) {
            return formatDef.toPlainText(data);
        }

        // Fallback : retourner le texte brut
        return body;
    } catch {
        // Pas du JSON → texte brut (ancien contenu ou édition manuelle)
        return body;
    }
}

/**
 * Parse un body JSON en nettoyant les balises markdown et la signature.
 * Retourne l'objet parsé ou null.
 */
export function parseBodyJson(raw: string): any | null {
    if (!raw) return null;
    try {
        const lastBrace = raw.lastIndexOf('}');
        if (lastBrace === -1) return null;
        const cleaned = raw.slice(0, lastBrace + 1);
        return JSON.parse(cleaned);
    } catch {
        return null;
    }
}

/**
 * Obtient le storageField pour un TargetFormat donné.
 * Utile pour savoir où écrire le résultat de la rédaction.
 */
export function getStorageField(format: TargetFormat | null | undefined): StorageField {
    if (!format) return 'body';
    const def = FORMAT_REGISTRY[format];
    return def?.storageField || 'body';
}

/**
 * Obtient l'editorTab pour un TargetFormat donné.
 * Utile pour naviguer vers le bon tab après génération.
 */
export function getEditorTab(format: TargetFormat | null | undefined): EditorTab {
    if (!format) return 'content';
    const def = FORMAT_REGISTRY[format];
    return def?.editorTab || 'content';
}

/**
 * Obtient le promptTemplate du format cible pour injection dans le prompt du Rédacteur.
 */
export function getFormatPromptTemplate(format: TargetFormat | null | undefined): string {
    if (!format) return '';
    const def = FORMAT_REGISTRY[format];
    return def?.promptTemplate || '';
}

/**
 * Liste des shortKeys valides (pour valider les réponses IA)
 */
export const VALID_SHORT_KEYS = Object.values(FORMAT_REGISTRY).map(d => d.shortKey);
