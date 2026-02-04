// Déclaration globale pour Puter.js injecté via le script index.html
declare global {
  interface Window {
    puter: any;
  }
}

export const generateContent = async (
  prompt: string, 
  context: string, 
  currentContent: string,
  platform: string
): Promise<string> => {
  
  if (!window.puter) {
      console.error("Puter.js n'est pas chargé.");
      throw new Error("Puter.js n'est pas disponible. Vérifiez votre connexion internet ou le bloqueur de publicités.");
  }

  const systemPrompt = `
    Tu es un assistant de rédaction pour les réseaux sociaux.
    
    CONTEXTE DE L'UTILISATEUR (BRAND VOICE):
    ${context}

    TA MISSION:
    Rédiger ou améliorer un post pour la plateforme : ${platform}.
    
    CONTENU ACTUEL / IDÉE DE DÉPART:
    "${currentContent}"

    INSTRUCTION SPÉCIFIQUE:
    ${prompt}

    Renvoie uniquement le contenu suggéré, sans texte d'introduction ("Voici le post...").
  `;

  try {
    // Utilisation de Puter.js AI Chat
    // La méthode peut retourner un objet ou une string selon la version, on gère les deux cas.
    const response = await window.puter.ai.chat(systemPrompt);
    
    if (typeof response === 'string') {
        return response;
    } else if (response?.message?.content) {
        return response.message.content;
    } else if (response?.content) {
        return response.content;
    } else {
        return JSON.stringify(response);
    }
  } catch (error) {
    console.error("Puter AI Error:", error);
    throw new Error("Impossible de générer le contenu via Puter.js.");
  }
};