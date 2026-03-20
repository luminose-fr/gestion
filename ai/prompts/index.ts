/**
 * Composition des prompts système IA.
 *
 * Architecture à 3 couches :
 * 1. BASE FIXE (personas hardcodés depuis les RTF) → ai/prompts/*.ts
 * 2. COUCHE DYNAMIQUE OPTIONNELLE (contextes Notion complémentaires)
 * 3. RÈGLES DE SORTIE (spécifiques à chaque action)
 */

import { ANALYSTE_PERSONA } from './analyste';
import { INTERVIEWER_PERSONA } from './interviewer';
import { REDACTEUR_PERSONA, REDACTEUR_ADJUSTMENT_INTRO } from './redacteur';
import { ARTISTE_PERSONA } from './artiste';

// ── Types ────────────────────────────────────────────────────────────

export type AIAction =
    | 'ANALYZE_BATCH'
    | 'GENERATE_INTERVIEW'
    | 'DRAFT_CONTENT'
    | 'ADJUST_CONTENT'
    | 'GENERATE_CARROUSEL_SLIDES';

// ── Personas (base fixe) ─────────────────────────────────────────────

const PERSONA_PROMPTS: Record<string, string> = {
    ANALYZE_BATCH: ANALYSTE_PERSONA,
    GENERATE_INTERVIEW: INTERVIEWER_PERSONA,
    DRAFT_CONTENT: REDACTEUR_PERSONA,
    ADJUST_CONTENT: REDACTEUR_PERSONA,
    GENERATE_CARROUSEL_SLIDES: ARTISTE_PERSONA,
};

// ── Règles de sortie par action ──────────────────────────────────────

const OUTPUT_RULES: Record<string, string> = {

    ANALYZE_BATCH: `
RÈGLES DE SORTIE (FIXE) :
Tu dois traiter la liste d'idées fournie.
Pour chaque idée, retourne un objet JSON avec exactement ces champs :
1. 'id' : l'identifiant exact de l'idée tel que fourni dans l'entrée (OBLIGATOIRE).
2. 'titre' : Titre de travail proposé.
3. 'verdict' : uniquement une des valeurs suivantes : 'Valide', 'Trop lisse', 'À revoir'.
4. 'justification' : 2-3 phrases maximum expliquant le verdict.
5. 'cible_offre' : "Standard" | "Seuil" | "Transverse".
6. 'format_cible' : "Post Texte (Court)" | "Carrousel (Slide par Slide)" | "Script Vidéo (Reel/Short)" | "Script Vidéo (Youtube)" | "Article (Long/SEO)" | "Newsletter" | "Prompt Image".
7. 'plateformes' : un tableau contenant uniquement les noms exacts des plateformes autorisées (Facebook, Instagram, LinkedIn, Google My Business, Youtube, Blog, Newsletter).
8. 'angle_strategique' : L'angle précis, le brief pour l'Intervieweur puis l'Éditeur. 3-5 phrases qui 'durcissent' le propos et précisent la direction.
9. 'metaphore_suggeree' : Si une piste métaphorique émerge, la noter ici. Sinon : null.
10. 'profondeur' : "Direct" | "Légère" | "Complète". Direct = les notes sont suffisantes, pas besoin d'interview. Légère = 1 question par axe. Complète = 3 questions par axe.
Tu dois retourner UNIQUEMENT un tableau JSON d'objets sans aucun texte superflu ni balises markdown (pas de \`\`\`json).
    `.trim(),

    GENERATE_INTERVIEW: `
RÈGLES DE SORTIE (FORMAT JSON STRICT) :
Tu dois répondre EXCLUSIVEMENT sous la forme d'un objet JSON valide. Aucun texte avant ou après le JSON.

%%PROFONDEUR_INJECTION%%

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
    `.trim(),

    DRAFT_CONTENT: `
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
%%FORMAT_TEMPLATE%%
    `.trim(),

    ADJUST_CONTENT: `
%%CURRENT_CONTENT%%

INSTRUCTION D'AJUSTEMENT DE FLORENT :
%%ADJUSTMENT_REQUEST%%

Retourne le JSON complet modifié, dans le même format exact que l'original.
    `.trim(),

    GENERATE_CARROUSEL_SLIDES: `
%%CARROUSEL_PARAMS%%

FORMAT DE SORTIE (STRICT) :
{
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
    `.trim(),
};

// ── Builder de prompts ───────────────────────────────────────────────

interface BuildOptions {
    /** L'action IA à exécuter */
    action: AIAction;
    /** Description du contexte Notion complémentaire (optionnel) */
    notionContext?: string;
    /** Template de format — injecté dans %%FORMAT_TEMPLATE%% pour DRAFT_CONTENT */
    formatTemplate?: string;
    /** Profondeur — injectée dans %%PROFONDEUR_INJECTION%% pour GENERATE_INTERVIEW */
    profondeur?: string;
    /** Paramètres carrousel — injectés dans %%CARROUSEL_PARAMS%% pour GENERATE_CARROUSEL_SLIDES */
    carrouselParams?: string;
    /** Contenu actuel — injecté dans %%CURRENT_CONTENT%% pour ADJUST_CONTENT */
    currentContent?: string;
    /** Demande d'ajustement — injectée dans %%ADJUSTMENT_REQUEST%% pour ADJUST_CONTENT */
    adjustmentRequest?: string;
}

export function buildSystemPrompt(options: BuildOptions): string {
    const { action, notionContext, formatTemplate, profondeur, carrouselParams, currentContent, adjustmentRequest } = options;

    // 1. BASE FIXE : le persona complet (hardcodé)
    const persona = PERSONA_PROMPTS[action] || '';

    // 2. COUCHE DYNAMIQUE OPTIONNELLE : contexte Notion complémentaire
    const contextSection = notionContext
        ? `\n\n---\nCONTEXTE ADDITIONNEL :\n${notionContext}`
        : '';

    // 3. RÈGLES DE SORTIE : spécifiques à chaque action
    let outputRules = OUTPUT_RULES[action] || '';

    // Injections de variables dans les règles de sortie
    if (action === 'GENERATE_INTERVIEW' && profondeur) {
        outputRules = outputRules.replace('%%PROFONDEUR_INJECTION%%', `La profondeur demandée est : "${profondeur}"`);
    }
    if (action === 'DRAFT_CONTENT' && formatTemplate) {
        outputRules = outputRules.replace('%%FORMAT_TEMPLATE%%', formatTemplate);
    }
    if (action === 'GENERATE_CARROUSEL_SLIDES' && carrouselParams) {
        outputRules = outputRules.replace('%%CARROUSEL_PARAMS%%', carrouselParams);
    }
    if (action === 'ADJUST_CONTENT') {
        const adjustPersona = persona + '\n\n' + REDACTEUR_ADJUSTMENT_INTRO;
        outputRules = outputRules
            .replace('%%CURRENT_CONTENT%%', currentContent || '')
            .replace('%%ADJUSTMENT_REQUEST%%', adjustmentRequest || '');
        return `${adjustPersona}${contextSection}\n\n---\n${outputRules}`;
    }

    return `${persona}${contextSection}\n\n---\n${outputRules}`;
}

// Ré-exporter les personas pour accès direct si besoin
export { ANALYSTE_PERSONA } from './analyste';
export { INTERVIEWER_PERSONA } from './interviewer';
export { REDACTEUR_PERSONA, REDACTEUR_ADJUSTMENT_INTRO } from './redacteur';
export { ARTISTE_PERSONA } from './artiste';
