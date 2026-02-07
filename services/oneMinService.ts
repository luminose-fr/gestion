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

    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.error || data.message || "Erreur 1min.AI");
    }
    
    return data;
};

export const generateContent = async (request: OneMinRequest): Promise<string> => {
    try {
        // 1. Concaténer System Instruction et Prompt
        const fullPrompt = request.systemInstruction 
            ? `${request.systemInstruction}\n\n---\n\n${request.prompt}`
            : request.prompt;

        // 2. Créer la conversation
        const conversationData = await fetch1Min('create-conversation', {
            type: "CHAT_WITH_AI",
            title: `Generation ${new Date().toISOString()}`,
            model: request.model
        });

        const conversationId = conversationData.conversation?.uuid;
        if (!conversationId) {
            throw new Error("Impossible de créer une conversation 1min.AI");
        }

        // 3. Envoyer le message
        const messageResponse = await fetch1Min('send-message', {
            type: "CHAT_WITH_AI",
            conversationId: conversationId,
            model: request.model,
            promptObject: {
                prompt: fullPrompt,
                isMixed: false,
                webSearch: false
            }
        });

        // 4. Extraction robuste du résultat
        // L'API peut renvoyer la réponse dans aiRecord.aiRecordDetail.resultObject (tableau de strings)
        // ou directement dans response / text selon le model/feature.
        
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

        // Nettoyage des éventuels caractères d'échappement excessifs ou artefacts de stream
        return rawContent.trim();

    } catch (error: any) {
        console.error("1min.AI Service Error:", error);
        throw new Error(`Erreur 1min.AI: ${error.message}`);
    }
};