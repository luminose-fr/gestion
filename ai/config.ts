
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
Pour chaque idée, retourne un objet JSON avec exactement ces champs :
1. 'id' : l'identifiant exact de l'idée tel que fourni dans l'entrée (OBLIGATOIRE).
2. 'titre' : Titre de travail proposé.
3. 'verdict' : uniquement une des valeurs suivantes : 'Valide', 'Trop lisse', 'À revoir'.
4. 'justification' : 2-3 phrases maximum expliquant le verdict.
5. 'cible_offre' : "Standard" | "Seuil" | "Transverse".
6. 'format_cible' : "Post Texte (Court)" | "Carrousel (Slide par Slide)" | "Script Vidéo (Reel/Short)" | "Script Vidéo (Youtube)" | "Article (Long/SEO)" | "Prompt Image".
7. 'plateformes' : un tableau contenant uniquement les noms exacts des plateformes autorisées (Facebook, Instagram, LinkedIn, Google My Business, Youtube, Blog, Newsletter).
8. 'angle_strategique' : L'angle précis, le brief pour l'Intervieweur puis l'Éditeur. 3-5 phrases qui 'durcissent' le propos et précisent la direction.
9. 'metaphore_suggeree' : Si une piste métaphorique émerge, la noter ici. Sinon : null.
10. 'profondeur' : "Direct" | "Légère" | "Complète". Direct = les notes sont suffisantes, pas besoin d'interview. Légère = 1 question par axe. Complète = 3 questions par axe.
Tu dois retourner UNIQUEMENT un tableau JSON d'objets sans aucun texte superflu ni balises markdown (pas de \`\`\`json).
        `
    },

    GENERATE_INTERVIEW: {
        model: INTERNAL_MODELS.FAST,
        generationConfig: {
            responseMimeType: "application/json" as const
        },
        getSystemInstruction: (contextDesc: string, profondeur: string) => `
${contextDesc}

---

RÈGLES DE SORTIE (FORMAT JSON STRICT) :
Tu dois répondre EXCLUSIVEMENT sous la forme d'un objet JSON valide. Aucun texte avant ou après le JSON.

La profondeur demandée est : "${profondeur}"

Si profondeur = "Direct" (Mode Passe-plat) :
{"mode": "direct", "skip": true, "raison": "Les notes sont suffisantes pour ce format."}

Si profondeur = "Légère" ou "Complète" (Mode Maïeutique réactionnelle) :
{"mode": "reactionnel", "skip": false, "draft_zero": "Ton paragraphe de 5-6 lignes (le Draft 0) qui tente de résumer l'idée avec audace, en incarnant la voix de Florent.", "questions": ["Question 1 (Vérité clinique)", "Question 2 (Incarnation)"]}

DISCIPLINE :
- Le champ "draft_zero" est un premier jet : imparfait mais vivant. Il utilise l'angle stratégique et tente la métaphore suggérée.
- Le champ "questions" contient EXACTEMENT 2 chaînes de caractères.
- Q1 cible la vérité clinique : ce qui est faux, imprécis ou trop théorique dans le Draft 0.
- Q2 cible l'incarnation : une image, une sensation physique ou une anecdote anonymisée.
- Chaque question est formulée au "tu", comme si tu parlais directement à Florent.
- Chaque question est spécifique au sujet traité (pas de question générique réutilisable d'un sujet à l'autre).
        `
    },

    GENERATE_CARROUSEL_SLIDES: {
        model: INTERNAL_MODELS.FAST,
        generationConfig: {
            responseMimeType: "application/json" as const
        },
        getSystemInstruction: (contextDesc: string, targetOffer: string, metaphore: string, contenu: string) => `
${contextDesc}
Cible offre : ${targetOffer}
Métaphore centrale : ${metaphore}
Contenu carrousel : ${contenu}

FORMAT DE SORTIE (STRICT) :
json{
  "direction_globale": {
    "style": "Le style visuel unifié pour tout le carrousel.",
    "palette": "Les 3-4 couleurs dominantes.",
    "eclairage": "Le type de lumière constant.",
    "ambiance": "Le ressenti émotionnel global en quelques mots."
  },
  "slides": [
    {
      "numero": 1,
      "type": "ILLUSTRÉE ou TYPO",
      "titre": "Le titre ou accroche à afficher sur la slide. 6 mots max.",
      "texte": "Le corps de texte court à afficher sur la slide. 2-3 phrases max.",
      "prompt_dzine": "Le prompt complet en anglais, prêt à coller dans Dzine. 50-80 mots max. Null si type TYPO.",
      "indication_typo": "Si TYPO : couleur de fond suggérée et style de mise en page. Null si type ILLUSTRÉE.",
      "note_composition": "Où placer le texte sur l'image (ex: espace libre en haut, tiers gauche dégagé)."
    }
  ]
}
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
- profondeur ("Direct", "Légère" ou "Complète")
- notes (les notes brutes de Florent)
- draft_zero (le Draft 0 généré par l'Intervieweur, si disponible — un premier jet provocateur à corriger)
- questions_interview (les questions posées par l'Intervieweur, si disponible)
- reponses_interview (les réponses de Florent aux questions, si disponible)

LOGIQUE DE SOURCES :
- Si profondeur = "Direct" : utilise uniquement les notes. Il n'y a ni draft_zero, ni questions, ni réponses.
- Si profondeur = "Légère" ou "Complète" : le draft_zero est ton point de départ. Les réponses de Florent contiennent la vérité clinique et l'incarnation. Fusionne le tout pour produire un contenu qui sonne comme Florent.

RÈGLES DE SORTIE (FIXE) :
GRILLE DE PRODUCTION PAR FORMAT :
1. Post Texte (Court) — LinkedIn, FB, Insta
json{
  "format": "Post Texte",
  "hook": "1 phrase isolée, percutante. Question, affirmation paradoxale ou image choc.",
  "corps": "Paragraphes ultra-courts (1-2 phrases). Alternance prose/listes (→). Montée en tension. La métaphore filée structure le texte.",
  "baffe": "Conclusion tranchante — la vérité que le lecteur ne voulait pas entendre, dite avec tendresse.",
  "cta": "Appel à l'action (question ouverte, invitation à commenter, lien vers offre). JAMAIS d'emoji."
}
Ton : Direct, oralisé, percutant. On entend la voix.
Contrainte de longueur : 150 mots max pour le corps (hors hook et CTA).
2. Article (Long/SEO) — Blog, Newsletter
json{
  "format": "Article",
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
  "format": "Script Reel",
  "contrainte": "150 mots max (60 secondes)",
  "hook": "[0-3s] Hook visuel ou verbal. La phrase qui arrête le scroll.",
  "corps": "[3-50s] Corps rythmé. Style parlé. Intentions visuelles entre crochets : [Plan serré], [Texte à l'écran], [Changement d'angle].",
  "cta": "[50-60s] CTA rapide. Question ou invitation."
}
Ton : Parlé, naturel, comme le transcript sur l'injustice. L'humour et le paradoxe sont les moteurs.
4. Script Vidéo (Youtube)
json{
  "format": "Script Youtube",
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
  "format": "Carrousel",
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
