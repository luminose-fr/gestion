/**
 * Configuration des actions IA.
 *
 * Remplace l'ancien ai/config.ts.
 * Chaque action a :
 * - Un modèle par défaut
 * - Une config de génération (responseMimeType, etc.)
 * - Une fonction getSystemInstruction() qui compose le prompt via buildSystemPrompt()
 *
 * Les personas sont maintenant hardcodés dans ai/prompts/*.ts.
 * Les templates de format sont dans ai/formats.ts (FORMAT_REGISTRY).
 */

import { buildSystemPrompt } from "./prompts";
import { getFormatPromptTemplate } from "./formats";

// Tous les modèles passent désormais par l'API 1min.AI (plus de modèle interne Gemini).

// ── Actions IA ───────────────────────────────────────────────────────

export const AI_ACTIONS = {

    ANALYZE_BATCH: {
        generationConfig: {
            responseMimeType: "application/json" as const
        },
        /**
         * @param notionContext - Description du contexte Notion complémentaire (optionnel, peut être vide)
         */
        getSystemInstruction: (notionContext?: string) =>
            buildSystemPrompt({
                action: 'ANALYZE_BATCH',
                notionContext: notionContext || undefined,
            }),
    },

    GENERATE_INTERVIEW: {
        generationConfig: {
            responseMimeType: "application/json" as const
        },
        /**
         * @param notionContext - Description du contexte Notion complémentaire (optionnel)
         * @param profondeur - "Direct", "Légère" ou "Complète"
         */
        getSystemInstruction: (notionContext?: string, profondeur?: string) =>
            buildSystemPrompt({
                action: 'GENERATE_INTERVIEW',
                notionContext: notionContext || undefined,
                profondeur: profondeur || 'Complète',
            }),
    },

    COACH_CHAT: {
        generationConfig: {
            responseMimeType: "application/json" as const
        },
        /**
         * @param notionContext - Description du contexte Notion complémentaire (optionnel)
         */
        getSystemInstruction: (notionContext?: string) =>
            buildSystemPrompt({
                action: 'COACH_CHAT',
                notionContext: notionContext || undefined,
            }),
    },

    GENERATE_CARROUSEL_SLIDES: {
        generationConfig: {
            responseMimeType: "application/json" as const
        },
        /**
         * @param notionContext - Description du contexte Notion complémentaire (optionnel)
         * @param targetOffer - "Standard", "Seuil" ou "Transverse"
         * @param metaphore - La métaphore centrale du carrousel
         * @param contenu - Le contenu textuel des slides (JSON)
         */
        getSystemInstruction: (notionContext?: string, targetOffer?: string, metaphore?: string, contenu?: string) =>
            buildSystemPrompt({
                action: 'GENERATE_CARROUSEL_SLIDES',
                notionContext: notionContext || undefined,
                carrouselParams: `Cible offre : ${targetOffer || 'Transverse'}\nMétaphore centrale : ${metaphore || 'Non définie'}\nContenu carrousel : ${contenu || ''}`,
            }),
    },

    DRAFT_CONTENT: {
        generationConfig: {
            responseMimeType: "application/json" as const
        },
        /**
         * @param notionContext - Description du contexte Notion complémentaire (optionnel)
         * @param targetFormat - Le format cible (TargetFormat enum value) — pour injecter le bon template
         */
        getSystemInstruction: (notionContext?: string, targetFormat?: string) =>
            buildSystemPrompt({
                action: 'DRAFT_CONTENT',
                notionContext: notionContext || undefined,
                formatTemplate: getFormatPromptTemplate(targetFormat as any) || '',
            }),
    },

    ADJUST_CONTENT: {
        generationConfig: {
            responseMimeType: "application/json" as const
        },
        /**
         * @param notionContext - Description du contexte Notion complémentaire (optionnel)
         * @param currentContent - Le JSON du contenu actuel
         * @param adjustmentRequest - L'instruction d'ajustement de Florent
         */
        getSystemInstruction: (notionContext?: string, currentContent?: string, adjustmentRequest?: string) =>
            buildSystemPrompt({
                action: 'ADJUST_CONTENT',
                notionContext: notionContext || undefined,
                currentContent,
                adjustmentRequest,
            }),
    },

    ADJUST_DZINE_PROMPTS: {
        generationConfig: {
            responseMimeType: "application/json" as const
        },
        /**
         * @param notionContext - Contexte Notion complémentaire (optionnel — peut affiner le style des prompts)
         * @param slidesJson - JSON courant du carrousel (avec prompts_dzine déjà générés)
         * @param promptInstruction - L'instruction d'ajustement de Florent (FR)
         * @param slideNumero - Cible : numéro de slide à ajuster, ou null pour toutes
         */
        getSystemInstruction: (notionContext: string | undefined, slidesJson: string, promptInstruction: string, slideNumero: number | null) =>
            buildSystemPrompt({
                action: 'ADJUST_DZINE_PROMPTS',
                notionContext: notionContext || undefined,
                slidesJson,
                promptInstruction,
                promptTarget: slideNumero === null
                    ? 'TOUTES les slides illustrées (slide_numero: null)'
                    : `UNIQUEMENT la slide ${slideNumero} (slide_numero: ${slideNumero})`,
            }),
    },
};
