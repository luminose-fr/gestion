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
  "corps": "Court et tendu : 8-12 lignes MAX. Chaque phrase doit faire avancer le propos — aucun paragraphe explicatif, aucune glose. Ne DIS PAS au lecteur ce qu'il ressent ou pourquoi ça marche (pas de 'Le truc, c'est que...', 'Ce n'est même pas confortable', 'Et le connu, ça rassure'). Montre par l'image et la scène, le lecteur comprend tout seul. Paragraphes de 1-2 phrases. Alternance prose/listes (→). Montée en tension rapide vers un moment de bascule (une phrase lâchée en séance, un silence, un aveu). La conclusion percutante fait partie du corps — la vérité que le lecteur ne voulait pas entendre, dite avec tendresse. Coupe tout ce qui ralentit : si une phrase n'ajoute pas de tension ou d'image nouvelle, elle n'a rien à faire là.",
  "cta": "Question courte et tranchante pour engager la discussion. JAMAIS d'emoji.",
  "visuel": "Description de l'image suggérée (format 1:1 ou 4:5). Préfère une scène avec un personnage plutôt qu'un détail abstrait isolé. L'accroche à incruster sur l'image gagne à reprendre la métaphore centrale du texte plutôt qu'un concept détaché.",
  "prompt_dzine": "Prompt détaillé en anglais, prêt à coller dans Dzine. 50-80 mots. Composition épurée, éclairage dramatique, mood émotionnel et introspectif. Évite les références à des peintres classiques (pas de 'Caravaggio', 'Rembrandt'...). Pas de texte à générer dans l'image. Cohérent avec le visuel suggéré."
}
Ton : Direct, oralisé, percutant. On entend la voix. Fluide — le texte doit se lire d'une traite, sans qu'on ait envie de sauter un paragraphe.
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
GRILLE DE PRODUCTION — Carrousel — Instagram, LinkedIn
Format pédagogique. Ta production alimente directement la trame finale : zéro champ à réécrire après coup, tout est calibré pour Canva.

LONGUEUR ET TRAME (souple mais disciplinée) :
- Entre 5 et 10 slides. Vise 7 par défaut (standard qui marche sur les réseaux) — ajuste à la densité du propos.
- Au moins 1 slide ILLUSTRÉE pour porter la métaphore centrale. Tu peux en faire jusqu'à 3 si la matière s'y prête, mais pas plus (sinon le carrousel perd en lisibilité).
- Une slide TYPO a un fond texturé/coloré simple : le texte fait tout le travail. Utilise-la pour les transitions, les listes, le CTA.
- Une slide ILLUSTRÉE a un visuel IA en arrière-plan. Utilise-la pour la couverture, les moments à forte charge métaphorique, la clôture.

RÔLES ÉDITORIAUX (colonne vertébrale — reste interne, n'apparaît pas dans la slide finale) :
Pour chaque slide, choisis un "role" parmi :
- "Accroche" : donne envie de swiper. 1re slide en général.
- "Le Problème / Le Ressenti" : le client se reconnaît dans la douleur décrite.
- "L'Image Centrale" : la métaphore visualisée. Typiquement ILLUSTRÉE.
- "L'Explication / La Mécanique" : la mécanique psychique nommée et traduite en vécu.
- "Le Basculement" : le moment où le choix se pose. L'approche thérapeutique.
- "La Pépite / Synthèse" : la phrase à retenir, qui cristallise le propos.
- "CTA Luminose" : appel à l'action, question ouverte ou invitation. Sans emoji.
Tu n'es pas obligé d'utiliser tous ces rôles ni de les mettre dans cet ordre — sers la logique du propos. Mais chaque slide doit avoir un rôle explicite.

DENSITÉ (NON NÉGOCIABLE — l'œil lit en 2 secondes sur un réseau social) :
- "titre" : 6 mots MAXIMUM. Court, percutant, lisible en miniature.
- "texte" : 25 mots MAXIMUM (soit ~2 phrases courtes). Si ça dépasse, c'est trop.
- Si tu ne sais pas comment dire plus court : coupe plutôt que d'allonger.

FORMAT JSON ATTENDU :
{
  "format": "Carrousel",
  "slides": [
    {
      "numero": 1,
      "role": "Accroche",
      "type": "TYPO",
      "titre": "Titre accrocheur (≤ 6 mots)",
      "texte": "Phrase d'appel, 1-2 phrases courtes. ≤ 25 mots.",
      "intention_visuelle": null
    },
    {
      "numero": 3,
      "role": "L'Image Centrale",
      "type": "ILLUSTRÉE",
      "titre": "Légende courte (≤ 6 mots)",
      "texte": "Une phrase qui accompagne l'image. ≤ 25 mots.",
      "intention_visuelle": "Description FR de ce que l'image doit montrer concrètement (la métaphore visualisée, pas un concept abstrait). 2-3 phrases, en français. Sera traduite en prompt Dzine par le Directeur Artistique."
    }
    // ... autres slides selon la logique du propos
  ]
}

RÈGLES STRICTES :
- "intention_visuelle" est OBLIGATOIRE pour chaque slide de type ILLUSTRÉE, et DOIT être null pour TYPO.
- "intention_visuelle" est rédigée en français, c'est une direction éditoriale (ce qu'on veut voir), pas un prompt technique.
- Pas de champ "visuel" ni de champ "contenu" : utilise exactement les champs nommés ci-dessus.
- Retourne UNIQUEMENT le JSON, sans balises markdown ni texte d'intro.
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
