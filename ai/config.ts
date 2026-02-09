
import { Platform, AIModel } from "../types";

// Modèles internes fixes (Gemini de base)
export const INTERNAL_MODELS = {
    FAST: "gemini-3-flash-preview", 
    // SMART supprimé car n'existe pas publiquement
};

// Détecte si on doit utiliser 1min.AI ou Gemini direct
export const isOneMinModel = (apiCode: string, dynamicModels: AIModel[] = []) => {
    // Si c'est un code API présent dans la base Notion et n'est pas un code Gemini interne
    if (apiCode === INTERNAL_MODELS.FAST) {
        return false;
    }
    return dynamicModels.some(m => m.apiCode === apiCode) || true; // Par défaut on tente 1min si inconnu
};

// Configuration des actions IA
export const AI_ACTIONS = {
    ANALYZE_BATCH: {
        model: INTERNAL_MODELS.FAST,
        generationConfig: {
            responseMimeType: "application/json" as const
        },
        getSystemInstruction: (contextDesc: string) => `
${contextDesc}

---

RÈGLES DE SORTIE (FIXE) :
Tu dois traiter la liste d'idées fournie.
Pour chaque idée, tu dois répondre avec :
1. 'id' : l'identifiant exact de l'idée tel que fourni dans l'entrée (OBLIGATOIRE, ne jamais l'omettre).
2. 'verdict' : uniquement une des valeurs suivantes : 'Valide', 'Trop lisse', 'À revoir'.
3. 'angle' : ton conseil stratégique (remplira le champ 'Angle stratégique').
4. 'plateformes' : un tableau contenant uniquement les noms exacts des plateformes autorisées (Facebook, Instagram, LinkedIn, Google My Business, Youtube, Blog, Newsletter).
5. 'format_cible': "Post Texte (Court)" | "Carrousel (Slide par Slide)" | "Script Vidéo (Reel/Short)" | "Script Vidéo (Youtube)" | "Article (Long/SEO)" | "Prompt Image"
Tu dois retourner UNIQUEMENT un tableau JSON d'objets sans aucun texte superflu ni balises markdown (pas de \`\`\`json).
        `
    },

    GENERATE_INTERVIEW: {
        model: INTERNAL_MODELS.FAST,
        generationConfig: {
            responseMimeType: "application/json" as const
        },
        getSystemInstruction: (contextDesc: string) => `
${contextDesc}

---

RÈGLES DE SORTIE (FIXE) :
1. Tu dois répondre EXCLUSIVEMENT sous la forme d'un objet JSON. 
2. Ne fais aucune introduction, aucune conclusion, aucune commentaire.
3. Le format JSON doit être le suivant :
{
  "questions_interieures": [
    { "angle": "Curieux/Naïf", "questions": ["q1", "q2", "q3"] },
    { "angle": "Sceptique/Rationnel", "questions": ["q1", "q2", "q3"] },
    { "angle": "Expert/Clinique", "questions": ["q1", "q2", "q3"] }
  ]
}
        `
    },

    DRAFT_CONTENT: {
        model: INTERNAL_MODELS.FAST, // Utilisation de FAST car SMART est supprimé
        generationConfig: {
            responseMimeType: "application/json" as const
        },
        getSystemInstruction: (contextDesc: string, platforms: string, formatCible: string) => `

${contextDesc}

---

INSTRUCTIONS DE TÂCHE :
Tu vas recevoir un objet JSON contenant : 
- titre
- angle_strategique
- plateformes (liste)
- format_cible
- notes_initiales
- reponses_interview (les réponses de l'utilisateur à tes questions précédentes)

Ta mission est de rédiger le post final en te basant principalement sur les 'reponses_interview' et les 'notes_initiales'.
Tu dois aussi respecter le format cible suivant : "${formatCible}".

REGLÈS DE SORTIE (FIXE) :
1. Tu dois répondre EXCLUSIVEMENT sous la forme d'un objet JSON.
2. Le JSON doit contenir une clé unique "draft_final" (chaîne de caractères).
3. Le texte dans "draft_final" doit être formaté en Markdown (utilisant #, ##, **, etc.).
4. Si plusieurs plateformes sont demandées (${platforms}), adapte le ton si nécessaire ou sépare les versions dans le même champ "draft_final" par une ligne de démarcation claire (ex: ---).
5. Limite stricte : "draft_final" doit faire au maximum 180000 caractères.
5. Pas d'introduction, pas de conclusion, pas de \`\`\`json.
        `
    }
};
