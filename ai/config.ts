
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
3. 'angle' : L'angle précis, le brief pour l'Intervieweur puis l'Éditeur. 3-5 phrases qui 'durcissent' le propos et précisent la direction.
4. 'plateformes' : un tableau contenant uniquement les noms exacts des plateformes autorisées (Facebook, Instagram, LinkedIn, Google My Business, Youtube, Blog, Newsletter).
5. 'format_cible': "Post Texte (Court)" | "Carrousel (Slide par Slide)" | "Script Vidéo (Reel/Short)" | "Script Vidéo (Youtube)" | "Article (Long/SEO)" | "Prompt Image"
6. 'justification': "2-3 phrases maximum expliquant le verdict."
7. 'cible_offre': "Standard" | "Seuil" | "Transverse"
8. 'metaphore_suggeree': "Si une piste métaphorique émerge, la noter ici. Sinon : null."
9. 'titre': "Titre de travail proposé"
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
    { "angle": "Axe cheval de troie", "questions": ["q1", "q2", "q3"] },
    { "angle": "Axe gardien du seuil", "questions": ["q1", "q2", "q3"] },
    { "angle": "Axe mecanique invisible", "questions": ["q1", "q2", "q3"] }
  ]
}

DISCIPLINE :
- Chaque question est formulée au "tu", comme si tu parlais directement à Florent.
- Chaque question est spécifique au sujet traité (pas de question générique réutilisable d'un sujet à l'autre).
- Zéro bavardage. Pas de "Voici les questions...". Tu donnes directement le JSON.
        `
    },

    DRAFT_CONTENT: {
        model: INTERNAL_MODELS.FAST, // Utilisation de FAST car SMART est supprimé
        generationConfig: {
            responseMimeType: "application/json" as const
        },
        getSystemInstruction: (contextDesc: string) => `

${contextDesc}

---

Tu vas recevoir un objet JSON contenant :
- titre
- format_cible
- cible_offre
- angle_strategique
- metaphore_suggeree
- reponses_interview

REGLÈS DE SORTIE (FIXE) :
GRILLE DE PRODUCTION PAR FORMAT :
1. Post Texte (Court) — LinkedIn, FB, Insta
json{
  "format": "Post Texte (Court)",
  "hook": "1 phrase isolée, percutante. Question, affirmation paradoxale ou image choc.",
  "corps": "Paragraphes ultra-courts (1-2 phrases). Alternance prose/listes (→). Montée en tension. La métaphore filée structure le texte.",
  "baffe": "Conclusion tranchante — la vérité que le lecteur ne voulait pas entendre, dite avec tendresse.",
  "cta": "Appel à l'action (question ouverte, invitation à commenter, lien vers offre). JAMAIS d'emoji."
}
Ton : Direct, oralisé, percutant. On entend la voix.
Contrainte de longueur : 150 mots max pour le corps (hors hook et CTA). Si le texte dépasse, c'est qu'il y a du gras à couper. Un Post Texte n'est PAS un mini-article — c'est une pensée unique, dense, qui frappe et s'arrête.
2. Article (Long/SEO) — Blog, Newsletter
json{
  "format": "Article (Long/SEO)",
  "titre_h1": "Titre accrocheur incluant le mot-clé principal.",
  "introduction": "Structure PAS (Problème → Agitation → Solution). 3-4 paragraphes. Pose la métaphore centrale dès l'intro.",
  "sections": [
    {
      "sous_titre_h2": "Titre structurant",
      "contenu": "Développement. Alterner rigueur clinique et images concrètes. Chaque section fait progresser vers le seuil."
    }
  ],
  "conclusion": "Récapitulatif + angle de rupture. Pas de résumé plat — une ouverture qui laisse le lecteur face à son choix.",
  "cta": "Bloc d'appel à l'action contextuel."
}
Ton : Expert, posé, pédagogique, mais garde la radicalité du Seuil et l'oralité de Florent.
3. Script Vidéo (Reel/Short) — Insta, TikTok, Shorts
json{
  "format": "Script Vidéo (Reel/Short)",
  "contrainte": "150 mots max (60 secondes)",
  "hook": "[0-3s] Hook visuel ou verbal. La phrase qui arrête le scroll.",
  "corps": "[3-50s] Corps rythmé. Style parlé. Intentions visuelles entre crochets : [Plan serré], [Texte à l'écran], [Changement d'angle].",
  "cta": "[50-60s] CTA rapide. Question ou invitation."
}
Ton : Parlé, naturel, comme le transcript sur l'injustice. L'humour et le paradoxe sont les moteurs.
4. Script Vidéo (Youtube)
json{
  "format": "Script Vidéo (Youtube)",
  "intro": "Hook + Promesse claire. Pourquoi rester jusqu'au bout.",
  "developpement": [
    {
      "point": "Titre du point",
      "contenu": "Développement narratif. Métaphores filées. Anecdotes de cabinet."
    }
  ],
  "conclusion": "Ouverture + angle de rupture. Pas de résumé mécanique."
}
Ton : Narratif, profond, utilisant des métaphores filées. Plus long, plus contemplatif, mais toujours incarné.
5. Carrousel (Slide par Slide) — LinkedIn, Insta
json{
  "format": "Carrousel (Slide par Slide)",
  "slides": [
    {
      "numero": 1,
      "titre": "6 mots max",
      "texte": "Texte court",
      "visuel": "Description de l'image ou du schéma suggéré"
    }
  ],
  "slide_finale": {
    "titre": "Interaction",
    "texte": "CTA : partage, commentaire, lien."
  }
}
5 à 10 slides. Slide 1 = hook visuel. Dernière slide = interaction.
6. Prompt Image (IA Générative)
json{
  "format": "Prompt Image",
  "prompt": "Prompt détaillé et artistique en anglais pour Midjourney/DALL-E illustrant la métaphore centrale.",
  "legende": "2 phrases max pour accompagner l'image sur les réseaux."
}
Interdiction absolue : Aucun autre texte.
        `
    }
};
