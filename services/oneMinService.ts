import { WORKER_URL } from "../constants";
import { getSessionToken } from "../auth";

interface OneMinRequest {
  model: string;
  prompt: string;
  systemInstruction?: string; // 1min.AI n'a pas de champ system distinct dans promptObject, on concatènera
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
        // 1. Concaténer System Instruction et Prompt car 1min.AI n'a pas de champ système dédié dans promptObject
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
                webSearch: false // On désactive pour la vitesse et le coût, sauf si besoin spécifique
            }
        });

        // 4. Extraire la réponse
        // Note: La structure de réponse exacte dépend de l'API. 
        // On suppose ici que la réponse textuelle est dans data.response ou data.text ou similaire.
        // D'après les standards, souvent c'est dans `response` ou une structure `message`.
        // On log pour debug si besoin.
        
        // Tentative d'extraction générique
        const text = messageResponse.response || messageResponse.text || messageResponse.output || JSON.stringify(messageResponse);
        
        return text;

    } catch (error: any) {
        console.error("1min.AI Service Error:", error);
        throw new Error(`Erreur 1min.AI: ${error.message}`);
    }
};