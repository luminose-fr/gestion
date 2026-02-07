import { WORKER_URL } from "../constants";
import { getSessionToken } from "../auth";

interface GeminiRequest {
  model?: string;
  prompt: string;
  systemInstruction?: string;
  generationConfig?: {
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
    response_mime_type?: "application/json"; // Support du mode JSON
  };
}

export const generateContent = async (request: GeminiRequest): Promise<string> => {
  const sessionToken = getSessionToken();
  
  const response = await fetch(`${WORKER_URL}/gemini/generate-content`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Token': sessionToken || '',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json();
    
    // Gestion spécifique des erreurs de Quota (429)
    const internalError = errorData.details?.error;
    
    if (response.status === 429 || internalError?.code === 429 || internalError?.status === "RESOURCE_EXHAUSTED") {
        let waitTime = "quelques instants";
        
        // Tentative d'extraction du temps d'attente depuis le message
        // Pattern: "Please retry in 55.487327673s."
        if (internalError?.message) {
            const match = internalError.message.match(/Please retry in ([0-9.]+)s/);
            if (match && match[1]) {
                const seconds = Math.ceil(parseFloat(match[1]));
                waitTime = `${seconds} secondes`;
            }
        }
        
        // Tentative d'extraction depuis les détails structurés
        if (waitTime === "quelques instants" && internalError?.details) {
             const retryInfo = internalError.details.find((d: any) => d['@type']?.includes('RetryInfo'));
             if (retryInfo && retryInfo.retryDelay) {
                 waitTime = retryInfo.retryDelay;
             }
        }

        throw new Error(`⚠️ Quota IA dépassé (Free Tier). Veuillez patienter ${waitTime} avant de réessayer.`);
    }

    throw new Error(internalError?.message || errorData.error || 'Erreur Gemini API');
  }

  const data = await response.json();
  
  // Extraire le texte de la réponse Gemini
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
};

// Pour le streaming (optionnel)
export const streamContent = async (
  request: GeminiRequest,
  onChunk: (text: string) => void
): Promise<void> => {
  const sessionToken = getSessionToken();
  
  const response = await fetch(`${WORKER_URL}/gemini/stream-content`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Token': sessionToken || '',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error('Erreur streaming Gemini');
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) return;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const json = JSON.parse(line.slice(6));
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) onChunk(text);
        } catch (e) {
          // Ignorer les erreurs de parsing
        }
      }
    }
  }
};