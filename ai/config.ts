
import { Platform, AIModel } from "../types";

// Modèles internes fixes (Gemini de base)
export const INTERNAL_MODELS = {
    FAST: "gemini-3-flash-preview", 
    SMART: "gemini-3-pro-preview"
};

// Détecte si on doit utiliser 1min.AI ou Gemini direct
export const isOneMinModel = (apiCode: string, dynamicModels: AIModel[] = []) => {
    // Si c'est un code API présent dans la base Notion et n'est pas un code Gemini interne
    if (apiCode === INTERNAL_MODELS.FAST || apiCode === INTERNAL_MODELS.SMART) {
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
1. 'verdict' : uniquement une des valeurs suivantes : 'Valide', 'Trop lisse', 'À revoir'.
2. 'angle' : ton conseil stratégique (remplira le champ 'Angle stratégique').
3. 'plateformes' : un tableau contenant uniquement les noms exacts des plateformes autorisées (Facebook, Instagram, LinkedIn, Google My Business, Youtube, Blog, Newsletter).

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
        model: INTERNAL_MODELS.SMART,
        generationConfig: {
            responseMimeType: "application/json" as const
        },
        getSystemInstruction: (contextDesc: string, platforms: string) => `

${contextDesc}

---

INSTRUCTIONS DE TÂCHE :
Tu vas recevoir un objet JSON contenant : 
- titre
- angle_strategique
- plateformes (liste)
- notes_initiales
- reponses_interview (les réponses de l'utilisateur à tes questions précédentes)

Ta mission est de rédiger le post final en te basant principalement sur les 'reponses_interview' et les 'notes_initiales'.

REGLÈS DE SORTIE (FIXE) :
1. Tu dois répondre EXCLUSIVEMENT sous la forme d'un objet JSON.
2. Le JSON doit contenir une clé unique "draft_final" (chaîne de caractères).
3. Le texte dans "draft_final" doit être formaté en Markdown (utilisant #, ##, **, etc.).
4. Si plusieurs plateformes sont demandées (${platforms}), adapte le ton si nécessaire ou sépare les versions dans le même champ "draft_final" par une ligne de démarcation claire (ex: ---).
5. Pas d'introduction, pas de conclusion, pas de \`\`\`json.
        `
    }
};
