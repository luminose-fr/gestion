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
GRILLE DE PRODUCTION — Post "Punchline" (Texte + Image fixe) — LinkedIn, Facebook
Le format idéal pour LinkedIn et Facebook. Il repose sur un contraste entre un visuel fort et un texte court qui bouscule une idée reçue.
{
  "format": "Post Texte",
  "accroche": "1 phrase isolée, percutante. Question, affirmation paradoxale ou image choc. C'est le hook qui arrête le scroll.",
  "corps": "Développement de la métaphore filée + explication clinique. 10-15 lignes. Paragraphes courts (2-3 phrases). Alternance prose/listes (→). Montée en tension. La conclusion percutante fait partie du corps — la vérité que le lecteur ne voulait pas entendre, dite avec tendresse.",
  "cta": "Question pour engager la discussion ou invitation à lire l'article complet / s'inscrire. JAMAIS d'emoji.",
  "visuel": "Description de l'image suggérée (format 1:1 ou 4:5), métaphorique, avec un titre court à incruster sur l'image.",
  "prompt_dzine": "Prompt détaillé en anglais, prêt à coller dans Dzine. 50-80 mots. Cohérent avec le visuel suggéré et sans texte à générer dans l'image."
}
Ton : Direct, oralisé, percutant. On entend la voix.
    `.trim(),
    toPlainText: (data: any): string => {
        const out: string[] = [];
        if (data.accroche) out.push(t(data.accroche));
        if (data.corps) out.push(t(data.corps));
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
GRILLE DE PRODUCTION — Article (Long/SEO) — Blog
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
GRILLE DE PRODUCTION — Script "Vidéo Courte" (Reel/Short) — Insta, TikTok, Shorts
Ce format mise sur l'incarnation. Il utilise la matière des réponses vocales pour créer un script naturel de moins de 60 secondes.
{
  "format": "Script Reel",
  "contrainte": "60 secondes max",
  "sections": [
    { "timing": "[0-3s]",   "role": "Accroche",   "texte": "L'accroche visuelle et verbale (le 'Quoi'). La phrase qui arrête le scroll.", "intention": "Note de rythme, ton, regard caméra, etc." },
    { "timing": "[3-15s]",  "role": "Constat",     "texte": "Empathie avec la douleur du client. On nomme ce qu'il vit.", "intention": "Note de rythme, pause, ton empathique, etc." },
    { "timing": "[15-45s]", "role": "Bascule",     "texte": "L'apport de l'expertise via une image forte. La métaphore qui éclaire.", "intention": "Note de rythme, changement de ton, montée en intensité, etc." },
    { "timing": "[45-60s]", "role": "Ouverture",   "texte": "Une réflexion qui reste en tête. Pas de résumé — une ouverture.", "intention": "Note de rythme, regard, silence final, etc." }
  ]
}
Ton : Parlé, naturel, comme le transcript sur l'injustice. L'humour et le paradoxe sont les moteurs.
Le script inclut des notes de rythme et d'intentions (pauses, ton) dans le champ "intention" de chaque section.
    `.trim(),
    toPlainText: (data: any): string => {
        const out: string[] = [];
        (data.sections || []).forEach((s: any) => {
            if (s.texte) out.push(t(s.texte));
        });
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
GRILLE DE PRODUCTION — Carrousel "Épuré" (7 Slides) — Instagram, LinkedIn
Format pédagogique par excellence. Structure fixe pour copier-coller rapide dans un template Canva.
STRUCTURE FIXE DU CARROUSEL (7 slides obligatoires) :
Slide 1 — Accroche : type TEXTE. Texte seul, gros impact. L'accroche pure qui donne envie de swiper.
Slide 2 — Le Problème / Le Ressenti : type TEXTE. Le problème ou le ressenti du client. Il se reconnaît dans la douleur décrite.
Slide 3 — L'Image Centrale : type IMAGE. Le seul visuel du carrousel, illustrant la métaphore. Courte légende accompagnant l'image.
Slide 4 — L'Explication / La Mécanique : type TEXTE. L'explication psychique, la mécanique invisible nommée et traduite en vécu.
Slide 5 — Le Basculement : type TEXTE. Le moment où le choix se pose : continuer ou traverser. L'approche thérapeutique.
Slide 6 — La Pépite / Synthèse : type TEXTE. La pépite à retenir, la synthèse qui cristallise le propos.
Slide 7 — CTA Luminose : type TEXTE. Appel à l'action fixe, direct, sans emoji. Question ouverte ou invitation.

FORMAT JSON ATTENDU :
{
  "format": "Carrousel",
  "slides": [
    { "numero": 1, "role": "Accroche",                    "type": "TEXTE", "texte": "Texte à gros impact, accroche pure." },
    { "numero": 2, "role": "Le Problème / Le Ressenti",   "type": "TEXTE", "texte": "Le problème ou le ressenti du client." },
    { "numero": 3, "role": "L'Image Centrale",            "type": "IMAGE", "texte": "Courte légende accompagnant l'image.", "visuel": "Description de l'image illustrant la métaphore." },
    { "numero": 4, "role": "L'Explication / La Mécanique", "type": "TEXTE", "texte": "L'explication psychique, la mécanique invisible." },
    { "numero": 5, "role": "Le Basculement",              "type": "TEXTE", "texte": "Le basculement, l'approche thérapeutique." },
    { "numero": 6, "role": "La Pépite / Synthèse",        "type": "TEXTE", "texte": "La pépite à retenir, la synthèse." },
    { "numero": 7, "role": "CTA Luminose",                "type": "TEXTE", "texte": "Appel à l'action fixe. Sans emoji." }
  ]
}
IMPORTANT : Toujours exactement 7 slides. Pas de slide_finale séparée. Seule la slide 3 est de type IMAGE.
    `.trim(),
    toPlainText: (data: any): string => {
        const out: string[] = [];
        (data.slides || []).forEach((s: any) => {
            if (s.texte) out.push(t(s.texte));
        });
        return out.filter(Boolean).join(' ');
    }
};

const NEWSLETTER: FormatDefinition = {
    key: TargetFormat.NEWSLETTER,
    shortKey: 'Newsletter',
    storageField: 'body',
    editorTab: 'atelier',
    promptTemplate: `
GRILLE DE PRODUCTION — Newsletter — Mailing-list
Contenu pour la newsletter de Florent. Ton personnel et chaleureux. Vouvoiement obligatoire (jamais de tutoiement).
On sent la relation directe praticien → abonné.
{
  "format": "Newsletter",
  "objet": "Objet de l'email : court, intrigant, qui donne envie d'ouvrir.",
  "accroche": "Les premières phrases qui captent l'attention : citations, questions rhétoriques, images choc. Elles posent le décor émotionnel.",
  "corps": "Développement en paragraphes. Vouvoiement. Explication du pourquoi, proposition concrète (date, lieu, contexte). Alterner prose et listes à puces (•) pour les détails pratiques. Chaque paragraphe fait progresser vers l'action.",
  "repositionnement": "Paragraphe qui requalifie la pratique ou l'offre — ce que c'est vraiment vs. ce qu'on croit. La phrase qui recadre.",
  "baffe": "Phrase finale percutante — la vérité que le lecteur ne voulait pas entendre.",
  "cta": "Appel à l'action avec lien. Utiliser le format : 👉 __Texte du lien__"
}
Ton : Personnel, chaleureux, vouvoiement. Direct mais bienveillant.
Contrainte de longueur : 300-500 mots.
Ne PAS inclure de salutation (Bonjour) ni de signature (Chaleureusement, Florent Jaouali) — ils sont ajoutés automatiquement par l'outil d'envoi.
    `.trim(),
    toPlainText: (data: any): string => {
        const out: string[] = [];
        if (data.accroche) out.push(t(data.accroche));
        if (data.corps) out.push(t(data.corps));
        if (data.repositionnement) out.push(t(data.repositionnement));
        if (data.baffe) out.push(t(data.baffe));
        if (data.cta) out.push(t(data.cta));
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
    [TargetFormat.NEWSLETTER]: NEWSLETTER,
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
