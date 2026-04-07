import { WORKER_URL } from "../constants";
import { getSessionToken } from "../auth";

interface OneMinRequest {
  model: string;
  prompt: string;
  systemInstruction?: string;
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

export const generateContent = async (request: OneMinRequest): Promise<string> => {
    try {
        // Concaténer System Instruction et Prompt
        const fullPrompt = request.systemInstruction
            ? `${request.systemInstruction}\n\n---\n\n${request.prompt}`
            : request.prompt;

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
