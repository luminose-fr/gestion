import { Platform } from "../types";

// Modèles disponibles
export const AI_MODELS = {
    // Google Gemini
    FAST: "gemini-3-flash-preview", 
    SMART: "gemini-3-pro-preview",
    
    // 1min.AI Models
    GPT_4O_MINI: "gpt-4o-mini", // Équilibré et rapide
    GPT_4O: "gpt-4o", // Très intelligent
    CLAUDE_3_5_SONNET: "claude-3-5-sonnet-20240620", // Excellent pour la rédaction
    MISTRAL_LARGE: "mistral-large-latest" // Alternative européenne
};

export const isOneMinModel = (model: string) => {
    return [
        AI_MODELS.GPT_4O_MINI,
        AI_MODELS.GPT_4O,
        AI_MODELS.CLAUDE_3_5_SONNET,
        AI_MODELS.MISTRAL_LARGE
    ].includes(model);
};

// Configuration des actions IA
export const AI_ACTIONS = {
    // 1. Action : Analyser un lot d'idées (Vue Idées)
    ANALYZE_BATCH: {
        model: AI_MODELS.FAST,
        generationConfig: {
            response_mime_type: "application/json" as const
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

    // 2. Action : Envoyer à l'interviewer (Vue En cours)
    // Génère des questions pour aider l'utilisateur à approfondir son sujet
    GENERATE_INTERVIEW: {
        model: AI_MODELS.FAST, // Le modèle rapide suffit souvent pour poser des questions
        generationConfig: {
            response_mime_type: "application/json" as const
        },
        getSystemInstruction: (contextDesc: string) => `
${contextDesc}

---

RÈGLES DE SORTIE (FIXE) :
1. Tu dois répondre EXCLUSIVEMENT sous la forme d'un objet JSON. 
2. Ne fais aucune introduction, aucune conclusion, aucun commentaire.
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

    // 3. Action : Rédiger le contenu (Vue En cours / Éditeur)
    DRAFT_CONTENT: {
        model: AI_MODELS.SMART, // On peut passer à SMART si besoin de plus de finesse
        generationConfig: {
            response_mime_type: "application/json" as const
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