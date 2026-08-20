/**
 * coachService — orchestre l'envoi de messages au Coach (chat itératif)
 * et le parsing de sa réponse JSON structurée (message + quick_replies).
 *
 * Tous les appels passent par l'API 1min.AI,
 * en s'appuyant sur l'historique CoachSession côté client.
 */

import { AI_ACTIONS } from '@luminose/editorial';
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
export const buildCoachBrief = (item: ContentItem): string => {
    const parts: string[] = [];
    parts.push(`TITRE : ${item.title || '(sans titre)'}`);
    if (item.targetFormat) parts.push(`FORMAT CIBLE : ${item.targetFormat}`);
    if (item.objectif) parts.push(`OBJECTIF DU POST : ${item.objectif}`);
    if (item.strategicAngle) parts.push(`ANGLE STRATÉGIQUE :\n${item.strategicAngle}`);
    if (item.suggestedMetaphor) parts.push(`MÉTAPHORE SUGGÉRÉE : ${item.suggestedMetaphor}`);
    if (item.justification) parts.push(`JUSTIFICATION DE L'ANALYSE :\n${item.justification}`);
    if (item.notes) parts.push(`NOTES DE FLORENT :\n${item.notes}`);
    parts.push(`\nOuvre la conversation avec une première proposition calibrée au format cible (voir les règles du persona). Propose 2-4 quick_replies.`);
    return parts.join('\n\n');
};

// ── Parsing de la réponse IA ──────────────────────────────────────────

const extractJson = (raw: string): string => {
    let cleaned = raw.replace(/```json\s?/gi, '').replace(/```\s?/g, '').trim();
    cleaned = cleaned.replace(/^json\s*/i, '').trim();
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
        cleaned = cleaned.slice(first, last + 1);
    }
    return cleaned;
};

export const parseCoachReply = (rawResponse: string): CoachAIReply => {
    const cleaned = extractJson(rawResponse);
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
    notionContext?: string;
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
    const { session, userMessage, modelId, notionContext, aiModels } = opts;

    const systemInstruction = AI_ACTIONS.COACH_CHAT.getSystemInstruction(notionContext);

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
    notionContext?: string;
}): Promise<string> => {
    const { item, session, modelId, notionContext } = opts;

    const systemInstruction = AI_ACTIONS.LOCK_BRIEF.getSystemInstruction(notionContext);

    const payload = {
        titre: item.title || '(sans titre)',
        format_cible: item.targetFormat || 'Non défini',
        objectif: item.objectif || 'Non défini',
        angle_strategique: item.strategicAngle || '',
        metaphore_suggeree: item.suggestedMetaphor || '',
        notes: item.notes || '',
        session: session.messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role, content: m.content })),
    };

    const responseText = await AiService.generateContent({
        modelId: modelId,
        systemInstruction,
        prompt: JSON.stringify(payload),
    });

    const cleaned = extractJson(responseText);
    const parsed = JSON.parse(cleaned); // throw si invalide → fallback legacy côté appelant
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.structure)) {
        throw new Error('Brief verrouillé invalide (structure manquante).');
    }
    return JSON.stringify(parsed);
};

// ── Helpers de session ─────────────────────────────────────────────────
//
// La session n'est plus un blob réécrit à chaque tour : les messages sont des
// lignes côté API (SPEC §2.7). Ces helpers ne servent plus qu'à maintenir la
// vue locale entre deux appels, en miroir de ce que le serveur vient d'écrire.

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

export const appendUserMessage = (session: CoachSession, contentId: string, content: string): CoachSession => ({
    ...session,
    messages: [
        ...session.messages,
        localMessage(contentId, { role: 'user', content, raw: null, quickReplies: [], readyForEditor: false }),
    ],
});

export const appendAssistantReply = (session: CoachSession, contentId: string, reply: CoachAIReply): CoachSession => ({
    ...session,
    messages: [
        ...session.messages,
        localMessage(contentId, {
            role: 'assistant',
            content: reply.message,
            raw: reply.raw,
            quickReplies: reply.quickReplies,
            readyForEditor: reply.readyForEditor,
        }),
    ],
});

export const validateSession = (session: CoachSession): CoachSession => ({
    ...session,
    status: 'validated',
    validatedAt: Date.now(),
});
