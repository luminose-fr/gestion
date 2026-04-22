/**
 * coachService — orchestre l'envoi de messages au Coach (chat itératif)
 * et le parsing de sa réponse JSON structurée (message + quick_replies).
 *
 * Dispatche vers 1min.AI ou Gemini selon le modèle choisi,
 * en s'appuyant sur l'historique CoachSession côté client.
 */

import { AI_ACTIONS, isOneMinModel } from '../ai/actions';
import * as OneMinService from './oneMinService';
import * as GeminiService from './geminiService';
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
    if (item.targetOffer) parts.push(`CIBLE OFFRE : ${item.targetOffer}`);
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

    let responseText: string;
    if (isOneMinModel(modelId, aiModels)) {
        responseText = await OneMinService.generateContent({
            model: modelId,
            prompt: userMessage,
            systemInstruction,
            history,
        });
    } else {
        responseText = await GeminiService.generateContent({
            model: modelId,
            prompt: userMessage,
            systemInstruction,
            history,
            generationConfig: { response_mime_type: 'application/json' },
        });
    }

    return parseCoachReply(responseText);
};

// ── Helpers de session ─────────────────────────────────────────────────

export const createEmptySession = (formatCible: TargetFormat | null): CoachSession => ({
    version: 1,
    formatCible,
    messages: [],
    status: 'in_progress',
    validatedAt: null,
});

export const appendUserMessage = (session: CoachSession, content: string): CoachSession => ({
    ...session,
    messages: [
        ...session.messages,
        { role: 'user', content, timestamp: new Date().toISOString() } as CoachMessage,
    ],
});

export const appendAssistantReply = (session: CoachSession, reply: CoachAIReply): CoachSession => ({
    ...session,
    messages: [
        ...session.messages,
        {
            role: 'assistant',
            content: reply.message,
            raw: reply.raw,
            quickReplies: reply.quickReplies,
            readyForEditor: reply.readyForEditor,
            timestamp: new Date().toISOString(),
        } as CoachMessage,
    ],
});

export const validateSession = (session: CoachSession): CoachSession => ({
    ...session,
    status: 'validated',
    validatedAt: new Date().toISOString(),
});
