import { WORKER_URL } from "../constants";
import { getSessionToken } from "../auth";

/** Message multi-tour — utilisé pour le chat Coach */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface OneMinRequest {
  model: string;
  prompt: string;
  systemInstruction?: string;
  /**
   * Historique multi-tour. Si fourni, il est concaténé côté client
   * dans un seul prompt pour rester compatible avec le worker existant.
   * Le plus récent message user est ajouté en dernier (= `prompt`).
   */
  history?: ChatMessage[];
}

// Helper pour les appels fetch
const fetch1Min = async (endpoint: string, body: any) => {
    const sessionToken = getSessionToken();
    const response = await fetch(`${WORKER_URL}/1min/${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Session-Token': sessionToken || '',
        },
        body: JSON.stringify(body),
    });

    const responseText = await response.text();

    let data: any;
    try {
        data = JSON.parse(responseText);
    } catch (e) {
        console.error(`1min.AI ${endpoint}: réponse non-JSON:`, responseText.substring(0, 300));
        throw new Error(`L'API 1min.AI a renvoyé une réponse invalide (${response.status}). Réessayez dans quelques instants.`);
    }

    if (!response.ok) {
        throw new Error(data.error || data.message || `Erreur 1min.AI (${response.status})`);
    }

    return data;
};

/**
 * Concatène l'historique + le prompt final en un seul bloc texte.
 * Choix d'implémentation : on simule le multi-tour côté client en
 * injectant l'historique dans le prompt. Avantage : pas besoin de
 * changer le worker tout de suite. Inconvénient : pas de cache
 * serveur de conversation (acceptable pour une v1).
 */
const buildConversationPrompt = (history: ChatMessage[], latestPrompt: string): string => {
    if (!history || history.length === 0) return latestPrompt;

    const transcript = history.map(m => {
        const label = m.role === 'assistant' ? 'COACH' : 'FLORENT';
        return `[${label}]\n${m.content}`;
    }).join('\n\n');

    return `HISTORIQUE DE LA CONVERSATION JUSQU'ICI :\n\n${transcript}\n\n---\n\nMESSAGE ACTUEL DE FLORENT :\n${latestPrompt}\n\n---\n\nRÉPONDS MAINTENANT en tenant compte de tout l'historique.`;
};

export const generateContent = async (request: OneMinRequest): Promise<string> => {
    try {
        // Construction du prompt final avec historique éventuel
        const promptWithHistory = request.history && request.history.length > 0
            ? buildConversationPrompt(request.history, request.prompt)
            : request.prompt;

        // Concaténer System Instruction et Prompt
        const fullPrompt = request.systemInstruction
            ? `${request.systemInstruction}\n\n---\n\n${promptWithHistory}`
            : promptWithHistory;

        // Appel direct à l'API Chat with AI (UNIFY_CHAT_WITH_AI)
        const messageResponse = await fetch1Min('chat', {
            type: "UNIFY_CHAT_WITH_AI",
            model: request.model,
            promptObject: {
                prompt: fullPrompt,
                settings: {
                    webSearchSettings: {
                        webSearch: false,
                    },
                    historySettings: {
                        isMixed: false,
                        historyMessageLimit: 1,
                    },
                    withMemories: false,
                },
            }
        });

        // Extraction robuste du résultat
        let rawContent = "";

        const aiRecord = messageResponse.aiRecord;
        const resultObject = aiRecord?.aiRecordDetail?.resultObject;

        if (resultObject && Array.isArray(resultObject) && resultObject.length > 0) {
            rawContent = resultObject[0];
        } else {
            // Fallbacks selon les différentes versions de l'API constatées
            rawContent = messageResponse.response ||
                         messageResponse.text ||
                         messageResponse.output ||
                         aiRecord?.response ||
                         JSON.stringify(messageResponse);
        }

        // Nettoyage markdown json si présent
        rawContent = rawContent.replace(/```json\s?/g, '').replace(/```\s?/g, '');

        return rawContent.trim();

    } catch (error: any) {
        console.error("1min.AI Service Error:", error);
        throw new Error(`Erreur 1min.AI: ${error.message}`);
    }
};
