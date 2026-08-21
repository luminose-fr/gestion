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
import { getObjectifCtaRules } from "./objectives";

// Tous les modèles passent désormais par l'API 1min.AI (plus de modèle interne Gemini).

// ── Actions IA ───────────────────────────────────────────────────────

/**
 * Les actions IA du flux éditorial, dans l'ordre où elles interviennent.
 *
 * Cette liste — et non les clés de `AI_ACTIONS` — décrit ce que Florent règle :
 * `GENERATE_INTERVIEW` en est volontairement absente, l'Intervieweur ayant été
 * remplacé par le Coach et aucun écran ne le déclenchant plus.
 *
 * `attendu` dit ce que la tâche demande VRAIMENT au modèle. C'est ce qui guide
 * la dépense : juger et recopier ne réclament pas de talent d'écriture, porter
 * la voix n'admet pas d'économie.
 */
export const AI_ACTION_CATALOG = [
    { id: 'ANALYZE_BATCH',             persona: 'Analyste',      label: 'Analyse des idées',        attendu: 'juger' },
    { id: 'COACH_CHAT',                persona: 'Coach',         label: 'Atelier (conversation)',   attendu: 'voix' },
    { id: 'LOCK_BRIEF',                persona: 'Verrouilleur',  label: 'Brief verrouillé',         attendu: 'synthèse' },
    { id: 'DRAFT_CONTENT',             persona: 'Rédacteur',     label: 'Rédaction',                attendu: 'voix' },
    { id: 'ADJUST_CONTENT',            persona: 'Rédacteur',     label: 'Ajustement du texte',      attendu: 'voix' },
    { id: 'COLD_READ',                 persona: 'Lecteur froid', label: 'Relecture à froid',        attendu: 'juger' },
    { id: 'GENERATE_CARROUSEL_SLIDES', persona: 'Artiste',       label: 'Slides du carrousel',      attendu: 'recopie' },
    { id: 'ADJUST_DZINE_PROMPTS',      persona: 'Artiste',       label: 'Prompts d’image',          attendu: 'recopie' },
    { id: 'PLAN_SERIES',               persona: 'Éclateur',      label: 'Plan de série',            attendu: 'synthèse' },
] as const;

export type ConfigurableAction = (typeof AI_ACTION_CATALOG)[number]['id'];

export const CONFIGURABLE_ACTIONS: string[] = AI_ACTION_CATALOG.map(a => a.id);

/** Ce que la tâche demande au modèle, en clair — pour l'écran de réglage. */
export const ATTENDU_LABELS: Record<string, string> = {
    juger:    'Juger, classer — la constance compte, pas le style',
    recopie:  'Recopier sans abîmer — l’obéissance avant le talent',
    synthèse: 'Synthétiser sans rien perdre — l’exhaustivité compte',
    voix:     'Porter la voix — c’est le produit lui-même',
};

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

    LOCK_BRIEF: {
        generationConfig: {
            responseMimeType: "application/json" as const
        },
        /**
         * @param notionContext - Description du contexte Notion complémentaire (optionnel)
         */
        getSystemInstruction: (notionContext?: string) =>
            buildSystemPrompt({
                action: 'LOCK_BRIEF',
                notionContext: notionContext || undefined,
            }),
    },

    GENERATE_CARROUSEL_SLIDES: {
        generationConfig: {
            responseMimeType: "application/json" as const
        },
        /**
         * @param notionContext - Description du contexte Notion complémentaire (optionnel)
         * @param metaphore - La métaphore centrale du carrousel
         * @param contenu - Le contenu textuel des slides (JSON)
         */
        getSystemInstruction: (notionContext?: string, metaphore?: string, contenu?: string) =>
            buildSystemPrompt({
                action: 'GENERATE_CARROUSEL_SLIDES',
                notionContext: notionContext || undefined,
                carrouselParams: `Métaphore centrale : ${metaphore || 'Non définie'}\nContenu carrousel : ${contenu || ''}`,
            }),
    },

    DRAFT_CONTENT: {
        generationConfig: {
            responseMimeType: "application/json" as const
        },
        /**
         * @param notionContext - Description du contexte Notion complémentaire (optionnel)
         * @param targetFormat - Le format cible (TargetFormat enum value) — pour injecter le bon template
         * @param objectif - L'objectif du post (Objectif enum value) — pour injecter les règles CTA
         * @param serieContext - Contexte de série (SPEC §6.4), produit par buildSerieContextSection()
         */
        getSystemInstruction: (notionContext?: string, targetFormat?: string, objectif?: string, serieContext?: string) =>
            buildSystemPrompt({
                action: 'DRAFT_CONTENT',
                notionContext: notionContext || undefined,
                formatTemplate: getFormatPromptTemplate(targetFormat as any) || '',
                objectifCta: getObjectifCtaRules(objectif),
                serieContext: serieContext || undefined,
            }),
    },

    COLD_READ: {
        generationConfig: {
            responseMimeType: "application/json" as const
        },
        /**
         * @param notionContext - Description du contexte Notion complémentaire (optionnel)
         * @param format - Le format du contenu (pour contextualiser les contrôles)
         * @param objectif - L'objectif du post (pour vérifier l'alignement du CTA)
         * @param contenu - Le contenu final, tel qu'un inconnu le lirait (texte formaté)
         */
        getSystemInstruction: (notionContext: string | undefined, format: string, objectif: string, contenu: string) =>
            buildSystemPrompt({
                action: 'COLD_READ',
                notionContext: notionContext || undefined,
                coldReadParams: `FORMAT DU CONTENU : ${format}\nOBJECTIF DU POST : ${objectif}\n\nCONTENU À RELIRE (tel qu'un inconnu le découvrirait) :\n${contenu}`,
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

    PLAN_SERIES: {
        generationConfig: {
            responseMimeType: "application/json" as const
        },
        /**
         * L'Éclateur (SPEC §6.2). Le sujet, l'intention, le texte du contenu
         * pilier et les publications déjà prévues voyagent dans la charge
         * utile, pas dans l'instruction système : seul le persona est fixe.
         *
         * @param notionContext - Contexte additionnel (optionnel)
         */
        getSystemInstruction: (notionContext?: string) =>
            buildSystemPrompt({
                action: 'PLAN_SERIES',
                notionContext: notionContext || undefined,
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
