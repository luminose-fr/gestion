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
import { COACH_PERSONA } from './coach';
import { REDACTEUR_PERSONA, REDACTEUR_ADJUSTMENT_INTRO } from './redacteur';
import { ARTISTE_PERSONA } from './artiste';

// ── Types ────────────────────────────────────────────────────────────

export type AIAction =
    | 'ANALYZE_BATCH'
    | 'GENERATE_INTERVIEW'
    | 'COACH_CHAT'
    | 'DRAFT_CONTENT'
    | 'ADJUST_CONTENT'
    | 'GENERATE_CARROUSEL_SLIDES';

// ── Personas (base fixe) ─────────────────────────────────────────────

const PERSONA_PROMPTS: Record<string, string> = {
    ANALYZE_BATCH: ANALYSTE_PERSONA,
    GENERATE_INTERVIEW: INTERVIEWER_PERSONA,
    COACH_CHAT: COACH_PERSONA,
    DRAFT_CONTENT: REDACTEUR_PERSONA,
    ADJUST_CONTENT: REDACTEUR_PERSONA,
    GENERATE_CARROUSEL_SLIDES: ARTISTE_PERSONA,
};

// ── Règles de sortie par action ──────────────────────────────────────

const OUTPUT_RULES: Record<string, string> = {

    ANALYZE_BATCH: `
RÈGLES DE SORTIE (FIXE) :
Tu dois traiter la liste d'idées fournie. Chaque idée inclut un champ 'format_cible' déjà choisi par Florent : tu dois en tenir compte (densité, profondeur, ton attendu) mais tu ne le renvoies PAS.
Pour chaque idée, retourne un objet JSON avec exactement ces champs :
1. 'id' : l'identifiant exact de l'idée tel que fourni dans l'entrée (OBLIGATOIRE).
2. 'titre' : Titre de travail proposé.
3. 'verdict' : uniquement une des valeurs suivantes : 'Valide', 'Trop lisse', 'À revoir'.
4. 'justification' : 2-3 phrases maximum expliquant le verdict.
5. 'cible_offre' : "Standard" | "Seuil" | "Transverse".
6. 'plateformes' : un tableau contenant uniquement les noms exacts des plateformes autorisées (Facebook, Instagram, LinkedIn, Google My Business, Youtube, Blog, Newsletter).
7. 'angle_strategique' : L'angle précis, le brief pour l'Intervieweur puis l'Éditeur. 3-5 phrases qui 'durcissent' le propos et précisent la direction, en cohérence avec le format_cible fourni.
8. 'metaphore_suggeree' : Si une piste métaphorique émerge, la noter ici. Sinon : null.
9. 'profondeur' : "Direct" | "Légère" | "Complète". Direct = les notes sont suffisantes, pas besoin d'interview. Légère = 1 question par axe. Complète = 3 questions par axe. Calibre la profondeur en fonction du format_cible (un Reel court ne justifie pas une profondeur Complète, un article long la demande).
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

    COACH_CHAT: `
RÈGLES DE SORTIE (FORMAT JSON STRICT) :
Tu dois répondre EXCLUSIVEMENT sous la forme d'un objet JSON valide. Aucun texte avant ou après le JSON.

Structure exacte :
{
  "message": "Ton message à Florent, en markdown libre. C'est là que tu poses ta proposition, ta question, ton commentaire. Sois concret, entre direct dans la matière. Respecte les règles de voix (vouvoiement, zéro emoji).",
  "quick_replies": ["Réponse type 1 (formulée comme si c'était Florent qui parle)", "Réponse type 2", "..."],
  "ready_for_editor": false
}

RÈGLES :
- "message" est toujours présent et non vide.
- "quick_replies" contient 2 à 4 entrées courtes (max 60 caractères), à la première personne (c'est Florent qui les énoncera). Ces réponses seront pré-remplies dans le champ de saisie de Florent, qui pourra les éditer avant d'envoyer.
- "ready_for_editor" : true uniquement quand tu estimes avoir une direction solide et validable pour l'Éditeur (et dans ce cas, inclus "Go, passe à l'Éditeur" dans les quick_replies). Sinon false.
- Tu peux utiliser du markdown léger dans "message" (gras, listes). Pas de code fence, pas de JSON imbriqué dans ce champ.
    `.trim(),

    DRAFT_CONTENT: `
Tu vas recevoir un objet JSON contenant :
- titre
- format_cible
- cible_offre
- angle_strategique
- metaphore_suggeree
- notes (les notes brutes de Florent)
- coach_session (l'historique complet de la conversation Coach ↔ Florent : tableau d'objets {role, content}) — ta matière première principale quand disponible
- coach_final_direction (résumé en une phrase de la direction validée par Florent à la fin de la session — si disponible)

LOGIQUE DE SOURCES :
- Si coach_session est présent : extrais-en la direction validée par Florent (dernière proposition du Coach validée + corrections apportées par Florent). C'est ton point de départ. Les réponses de Florent dans la session contiennent la vérité clinique et l'incarnation.
- Si coach_session est absent (mode direct) : utilise uniquement les notes.

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

RÈGLES DE SORTIE (FORMAT JSON STRICT) :
Tu reçois le JSON brouillon complet du carrousel (cf. "Contenu carrousel" ci-dessus). Tu dois produire EXACTEMENT le même JSON, augmenté d'un champ "prompt_dzine" sur chaque slide :
- "prompt_dzine" est une string en anglais (50-80 mots) pour les slides de type "ILLUSTRÉE".
- "prompt_dzine" est null pour les slides de type "TYPO".

Tu ne touches à AUCUN autre champ : "numero", "role", "type", "titre", "texte", "intention_visuelle" sont recopiés à l'identique. Tu ne supprimes ni n'ajoutes de slide.

FORMAT DE SORTIE (STRICT) :
{
  "format": "Carrousel",
  "slides": [
    {
      "numero": 1,
      "role": "Accroche",
      "type": "TYPO",
      "titre": "…",
      "texte": "…",
      "intention_visuelle": null,
      "prompt_dzine": null
    },
    {
      "numero": 3,
      "role": "L'Image Centrale",
      "type": "ILLUSTRÉE",
      "titre": "…",
      "texte": "…",
      "intention_visuelle": "Description FR reçue (recopiée telle quelle)",
      "prompt_dzine": "English prompt, 50-80 words, ready for Dzine."
    }
  ]
}

Retourne UNIQUEMENT le JSON. Zéro texte avant, zéro texte après, zéro bloc markdown.
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
export { COACH_PERSONA } from './coach';
export { REDACTEUR_PERSONA, REDACTEUR_ADJUSTMENT_INTRO } from './redacteur';
export { ARTISTE_PERSONA } from './artiste';
