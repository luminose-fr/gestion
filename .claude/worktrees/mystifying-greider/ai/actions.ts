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

import { AIModel } from "../types";
import { buildSystemPrompt } from "./prompts";
import { getFormatPromptTemplate } from "./formats";

// ── Modèles internes fixes (Gemini de base) ──────────────────────────

export const INTERNAL_MODELS = {
    FAST: "gemini-3-flash-preview",
};

// ── Détection 1min.AI vs Gemini direct ───────────────────────────────

export const isOneMinModel = (apiCode: string, dynamicModels: AIModel[] = []) => {
    if (apiCode === INTERNAL_MODELS.FAST) {
        return false;
    }
    return dynamicModels.some(m => m.apiCode === apiCode) || true;
};

// ── Actions IA ───────────────────────────────────────────────────────

export const AI_ACTIONS = {

    ANALYZE_BATCH: {
        model: INTERNAL_MODELS.FAST,
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
        model: INTERNAL_MODELS.FAST,
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

    GENERATE_CARROUSEL_SLIDES: {
        model: INTERNAL_MODELS.FAST,
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
        model: INTERNAL_MODELS.FAST,
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
        model: INTERNAL_MODELS.FAST,
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
};
