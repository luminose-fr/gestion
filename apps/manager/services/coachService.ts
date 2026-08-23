/**
 * coachService — orchestre l'envoi de messages au Coach (chat itératif)
 * et le parsing de sa réponse JSON structurée (message + quick_replies).
 *
 * Tous les appels passent par l'API 1min.AI,
 * en s'appuyant sur l'historique CoachSession côté client.
 */

import { AI_ACTIONS, extractJsonPayload } from '@luminose/editorial';
import * as AiService from './aiService';
import type { CoachMessage, CoachSession, AIModel, ContentItem, TargetFormat } from '../types';

export interface CoachAIReply {
    message: string;
    quickReplies: string[];
    readyForEditor: boolean;
    raw: string;
}

// ── Construction du brief initial (message system → user) ──────────────

/**
 * Construit le premier message utilisateur (brief initial).
 * Ce message est envoyé à l'IA en même temps que le premier prompt Florent.
 */
export const buildCoachBrief = (item: ContentItem, contexteSerie?: string | null): string => {
    const parts: string[] = [];
    parts.push(`TITRE : ${item.title || '(sans titre)'}`);
    if (item.targetFormat) parts.push(`FORMAT CIBLE : ${item.targetFormat}`);
    if (item.objectif) parts.push(`OBJECTIF DU POST : ${item.objectif}`);
    if (item.strategicAngle) parts.push(`ANGLE STRATÉGIQUE :\n${item.strategicAngle}`);
    if (item.suggestedMetaphor) parts.push(`MÉTAPHORE SUGGÉRÉE : ${item.suggestedMetaphor}`);
    if (item.justification) parts.push(`JUSTIFICATION DE L'ANALYSE :\n${item.justification}`);
    if (item.notes) parts.push(`NOTES DE FLORENT :\n${item.notes}`);
    // Une publication de série n'est pas une idée isolée : l'atelier doit
    // savoir ce qui précède et ce qui suit, sinon il propose une direction
    // que le Rédacteur devra corriger plus tard (SPEC §6.4).
    if (contexteSerie) parts.push(contexteSerie);
    parts.push(`\nOuvre la conversation avec une première proposition calibrée au format cible (voir les règles du persona). Propose 2-4 quick_replies.`);
    return parts.join('\n\n');
};

// ── Parsing de la réponse IA ──────────────────────────────────────────

/**
 * L'extraction vit dans @luminose/editorial, avec le reste du parsing
 * défensif : elle sait reconnaître le dernier bloc JSON valide quand un modèle
 * se corrige en cours de réponse — et c'est arrivé.
 */
const extractJson = (raw: string, convient?: (valeur: any) => boolean): string =>
    extractJsonPayload(raw, convient);

export const parseCoachReply = (rawResponse: string): CoachAIReply => {
    // Le bloc qui porte un `message` : quand le Coach se reprend, sa première
    // tentative n'est pas celle qu'il faut lire.
    const cleaned = extractJson(rawResponse, (v) => typeof v?.message === 'string');
    let data: any;
    try {
        data = JSON.parse(cleaned);
    } catch {
        // Fallback : on renvoie le texte brut comme message, sans quick replies
        return {
            message: rawResponse.trim(),
            quickReplies: [],
            readyForEditor: false,
            raw: rawResponse,
        };
    }
    const message = typeof data?.message === 'string' && data.message.trim()
        ? data.message.trim()
        : (typeof data === 'string' ? data : rawResponse.trim());
    const quickReplies: string[] = Array.isArray(data?.quick_replies)
        ? data.quick_replies.filter((q: any) => typeof q === 'string' && q.trim()).slice(0, 4)
        : [];
    const readyForEditor = Boolean(data?.ready_for_editor);
    return { message, quickReplies, readyForEditor, raw: rawResponse };
};

// ── Dispatcher IA ──────────────────────────────────────────────────────

interface SendOptions {
    session: CoachSession;
    userMessage: string;
    modelId: string;
    /** Contexte additionnel injecté dans le persona — aujourd'hui, la série. */
    contexteAdditionnel?: string;
    aiModels: AIModel[];
}

/**
 * Envoie un message au Coach, en tenant compte de tout l'historique de la session.
 * Retourne la réponse parsée (message + quick replies).
 *
 * Note : cette fonction ne mute pas la session. L'appelant est responsable
 * d'ajouter le message user ET la réponse assistant dans la session,
 * puis de persister côté Notion.
 */
export const sendCoachMessage = async (opts: SendOptions): Promise<CoachAIReply> => {
    const { session, userMessage, modelId, contexteAdditionnel, aiModels } = opts;

    const systemInstruction = AI_ACTIONS.COACH_CHAT.getSystemInstruction(contexteAdditionnel);

    // Historique au format ChatMessage (on ignore les éventuels messages system stockés)
    const history = session.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
        }));

    const responseText = await AiService.generateContent({
        modelId: modelId,
        prompt: userMessage,
        systemInstruction,
        history,
        // Le Coach rend un OBJET : le mode JSON natif des API compatibles
        // OpenAI s'applique, et interdit à la racine ce qui vient d'arriver —
        // deux blocs et de la prose entre eux. 1min.ai l'ignore, sans dommage.
        // Absent des actions qui rendent un TABLEAU : ce mode exige un objet.
        json: true,
    });

    return parseCoachReply(responseText);
};

// ── Brief verrouillé (au "Go Éditeur") ─────────────────────────────────

/**
 * Condense la session Coach en un brief verrouillé (via l'action LOCK_BRIEF).
 * Retourne le JSON sérialisé du brief — à stocker dans session.brief.
 * Lance une erreur si la réponse IA n'est pas exploitable (l'appelant peut
 * alors retomber sur le mode legacy : session brute transmise au Rédacteur).
 */
export const generateLockedBrief = async (opts: {
    item: ContentItem;
    session: CoachSession;
    modelId: string;
    contexteSerie?: string | null;
}): Promise<string> => {
    const { item, session, modelId, contexteSerie } = opts;

    const systemInstruction = AI_ACTIONS.LOCK_BRIEF.getSystemInstruction(contexteSerie || undefined);

    const payload = {
        titre: item.title || '(sans titre)',
        format_cible: item.targetFormat || 'Non défini',
        objectif: item.objectif || 'Non défini',
        angle_strategique: item.strategicAngle || '',
        metaphore_suggeree: item.suggestedMetaphor || '',
        notes: item.notes || '',
        // Le brief verrouillé sert de matière UNIQUE au Rédacteur : s'il perd
        // la série en route, l'anti-répétition arrive trop tard.
        ...(contexteSerie ? { contexte_serie: contexteSerie } : {}),
        session: session.messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role, content: m.content })),
    };

    const responseText = await AiService.generateContent({
        modelId: modelId,
        systemInstruction,
        prompt: JSON.stringify(payload),
    });

    const cleaned = extractJson(responseText, (v) => Array.isArray(v?.structure));
    const parsed = JSON.parse(cleaned); // throw si invalide → fallback legacy côté appelant
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.structure)) {
        throw new Error('Brief verrouillé invalide (structure manquante).');
    }
    return JSON.stringify(parsed);
};

// ── Helpers de session ─────────────────────────────────────────────────
//
// La session n'est plus un blob réécrit à chaque tour : les messages sont des
// lignes côté API (SPEC §2.7). Ces helpers fabriquent le message que l'on
// AJOUTE — à la vue locale et, par l'appelant, à la conversation stockée.

export const createEmptySession = (formatCible: TargetFormat | null): CoachSession => ({
    formatCible,
    messages: [],
    status: 'in_progress',
    brief: null,
    validatedAt: null,
});

/** Identifiant provisoire, remplacé par celui du serveur au rechargement. */
const localMessage = (
    contentId: string,
    fields: Omit<CoachMessage, 'id' | 'contentId' | 'createdAt'>
): CoachMessage => ({
    id: `local-${crypto.randomUUID()}`,
    contentId,
    createdAt: Date.now(),
    ...fields,
});

export const buildUserMessage = (contentId: string, content: string): CoachMessage =>
    localMessage(contentId, { role: 'user', content, raw: null, quickReplies: [], readyForEditor: false });

export const buildAssistantMessage = (contentId: string, reply: CoachAIReply): CoachMessage =>
    localMessage(contentId, {
        role: 'assistant',
        content: reply.message,
        raw: reply.raw,
        quickReplies: reply.quickReplies,
        readyForEditor: reply.readyForEditor,
    });

export const withMessage = (session: CoachSession, message: CoachMessage): CoachSession => ({
    ...session,
    messages: [...session.messages, message],
});

export const validateSession = (session: CoachSession): CoachSession => ({
    ...session,
    status: 'validated',
    validatedAt: Date.now(),
});
