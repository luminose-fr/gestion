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
    { id: 'ANALYZE_BATCH',             persona: 'Analyste',      label: 'Analyse des idées',        attendu: 'juger',
      pourChoisir: 'L’action la plus appelée du flux : une par idée. C’est elle qui fait la facture si vous prenez cher.' },
    { id: 'COACH_CHAT',                persona: 'Coach',         label: 'Atelier (conversation)',   attendu: 'voix',
      pourChoisir: 'La plus coûteuse : la conversation grossit à chaque tour, et tout l’historique repart à chaque message.' },
    { id: 'LOCK_BRIEF',                persona: 'Verrouilleur',  label: 'Brief verrouillé',         attendu: 'synthèse',
      pourChoisir: 'Quelques appels par mois, et le brief conditionne tout ce qui suit.' },
    { id: 'DRAFT_CONTENT',             persona: 'Rédacteur',     label: 'Rédaction',                attendu: 'voix',
      pourChoisir: 'C’est le produit. Le seul endroit où économiser se paie en temps de réécriture.' },
    { id: 'ADJUST_CONTENT',            persona: 'Rédacteur',     label: 'Ajustement du texte',      attendu: 'voix',
      pourChoisir: 'Doit modifier SEULEMENT ce qu’on lui demande, et rendre le JSON complet.' },
    { id: 'COLD_READ',                 persona: 'Lecteur froid', label: 'Relecture à froid',        attendu: 'juger',
      pourChoisir: 'Entrée courte, sortie courte, appelée à chaque rédaction.' },
    { id: 'GENERATE_CARROUSEL_SLIDES', persona: 'Artiste',       label: 'Slides du carrousel',      attendu: 'recopie',
      pourChoisir: 'Recopie tout le carrousel : le coût est dans les jetons produits, pas reçus.' },
    { id: 'ADJUST_DZINE_PROMPTS',      persona: 'Artiste',       label: 'Prompts d’image',          attendu: 'recopie',
      pourChoisir: 'Même recopie, en plus court — et les slides TYPO doivent rester à null.' },
    { id: 'PLAN_SERIES',               persona: 'Éclateur',      label: 'Plan de série',            attendu: 'synthèse',
      pourChoisir: 'Doit diverger : un modèle faible rend cinq reformulations de la même idée.' },
] as const;

export type ConfigurableAction = (typeof AI_ACTION_CATALOG)[number]['id'];

export const CONFIGURABLE_ACTIONS: string[] = AI_ACTION_CATALOG.map(a => a.id);

/**
 * Ce que chaque famille demande au modèle, et ce que ça implique pour le
 * choisir.
 *
 * `demande` dit la tâche ; `choix` dit où mettre l'argent. Les deux sont
 * séparés parce qu'on les lit à deux moments différents : le premier pour
 * comprendre, le second au moment d'ouvrir le menu.
 *
 * Le repère de fond, valable pour les quatre : les classements publics
 * mesurent la capacité à coder et à raisonner en plusieurs étapes. Aucune des
 * tâches ci-dessous ne demande ça.
 */
export const ATTENDU_FAMILLES: Record<string, { titre: string; demande: string; choix: string }> = {
    juger: {
        titre: 'Juger',
        demande: 'Rendre deux fois le même verdict sur le même texte, et un JSON propre. Le talent d’écriture ne sert à rien ici.',
        choix: 'Un modèle économique fait l’affaire — et c’est là qu’est le volume : une analyse par idée, une relecture par contenu.',
    },
    recopie: {
        titre: 'Recopier',
        demande: 'Rendre un JSON entier à l’identique en n’y ajoutant qu’un champ. C’est de l’obéissance, pas du talent.',
        choix: 'Économique aussi, mais pas n’importe lequel : un modèle qui « améliore » au passage casse la trame du carrousel. Si la structure revient abîmée, montez d’un cran.',
    },
    synthèse: {
        titre: 'Synthétiser',
        demande: 'Ne rien perdre. Pour le brief, la liste des interdits ; pour le plan, des angles vraiment distincts.',
        choix: 'Milieu de gamme au minimum. Volume dérisoire, enjeu élevé : un interdit oublié ressort dans le texte final, deux angles qui se ressemblent font deux publications jumelles.',
    },
    voix: {
        titre: 'Porter la voix',
        demande: 'Écrire comme Florent — vouvoiement, oralité, une seule métaphore filée, zéro emoji — sous une longue liste de contraintes.',
        choix: 'Votre meilleur modèle. Vingt textes par mois coûtent moins qu’un café, même au tarif le plus élevé ; le vrai coût, c’est de réécrire ce qui sonne faux.',
    },
};

/** L'ordre de lecture des familles : du moins au plus exigeant. */
export const ATTENDU_ORDRE = ['juger', 'recopie', 'synthèse', 'voix'];

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
