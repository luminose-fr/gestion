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
import { VERROUILLEUR_PERSONA } from './verrouilleur';
import { LECTEUR_FROID_PERSONA } from './lecteurFroid';

// ── Types ────────────────────────────────────────────────────────────

export type AIAction =
    | 'ANALYZE_BATCH'
    | 'GENERATE_INTERVIEW'
    | 'COACH_CHAT'
    | 'LOCK_BRIEF'
    | 'DRAFT_CONTENT'
    | 'ADJUST_CONTENT'
    | 'COLD_READ'
    | 'GENERATE_CARROUSEL_SLIDES'
    | 'ADJUST_DZINE_PROMPTS';

// ── Personas (base fixe) ─────────────────────────────────────────────

const PERSONA_PROMPTS: Record<string, string> = {
    ANALYZE_BATCH: ANALYSTE_PERSONA,
    GENERATE_INTERVIEW: INTERVIEWER_PERSONA,
    COACH_CHAT: COACH_PERSONA,
    LOCK_BRIEF: VERROUILLEUR_PERSONA,
    DRAFT_CONTENT: REDACTEUR_PERSONA,
    ADJUST_CONTENT: REDACTEUR_PERSONA,
    COLD_READ: LECTEUR_FROID_PERSONA,
    GENERATE_CARROUSEL_SLIDES: ARTISTE_PERSONA,
    ADJUST_DZINE_PROMPTS: ARTISTE_PERSONA,
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
5. 'objectif' : exactement une des valeurs suivantes : "Notoriété" | "Recadrage de croyance" | "Confiance / Preuve" | "Éducation pratique" | "Trafic contenu long" | "Conversion séance" | "Promotion événement". C'est l'objectif business du post (voir la liste des objectifs dans ton persona) — il dictera le CTA du Rédacteur. Choisis-en UN seul, celui qui sert le mieux l'idée.
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

    LOCK_BRIEF: `
RÈGLES DE SORTIE (FORMAT JSON STRICT) :
Tu reçois un objet JSON contenant : titre, format_cible, objectif, angle_strategique, metaphore_suggeree, notes, et session (l'historique complet de l'atelier Coach ↔ Florent : tableau d'objets {role, content} — "user" = Florent).

Tu retournes EXCLUSIVEMENT un objet JSON valide, sans texte avant ou après :
{
  "sujet_reel": "Le sujet du contenu en une phrase, dans les mots du lecteur visé (pas dans la métaphore).",
  "lecteur_vise": "Qui doit se reconnaître, et dans quelle douleur/situation concrète.",
  "metaphore": {
    "image": "La métaphore centrale retenue.",
    "limites": "Ce que l'image ne doit PAS faire affirmer (les points où elle casse, les affirmations littéralement fausses à éviter)."
  },
  "structure": ["Élément par élément (slide par slide, ou blocs du post) : la version FINALE validée, avec la formulation la plus récente de chaque élément."],
  "matiere_validee": ["Anecdotes, sensations, phrases exactes données ou validées par Florent pendant l'atelier."],
  "interdits": ["EXHAUSTIF : chaque idée, angle ou formulation corrigé, remplacé ou écarté pendant l'atelier — avec sa raison en quelques mots. C'est la partie la plus importante du brief."],
  "direction_cta": "La direction de fin validée, alignée sur l'objectif.",
  "questions_ouvertes": ["Questions du Coach restées sans réponse — matière à NE PAS inventer."]
}
    `.trim(),

    DRAFT_CONTENT: `
Tu vas recevoir un objet JSON contenant :
- titre
- format_cible
- objectif (l'objectif business du post — ses règles CTA sont détaillées plus bas)
- angle_strategique
- metaphore_suggeree
- notes (les notes brutes de Florent)
- brief_verrouille (le brief final verrouillé à l'issue de l'atelier — ta matière première UNIQUE quand présent)
- coach_session / coach_final_direction (legacy : historique brut de l'atelier, fourni seulement si aucun brief n'existe)

LOGIQUE DE SOURCES :
- Si brief_verrouille est présent : c'est ta seule matière, avec les notes. Respecte sa structure, sa matière validée et ses INTERDITS à la lettre — une idée listée dans les interdits n'apparaît nulle part, ni dans les slides, ni dans la légende, ni reformulée. N'utilise pas coach_session, même s'il est présent.
- Sinon, si coach_session est présent : extrais-en la direction validée par Florent, en écartant tout ce qu'il a corrigé ou refusé en cours de route.
- Sinon (mode direct) : utilise uniquement les notes.

%%OBJECTIF_CTA%%

RÈGLES DE SORTIE (FIXE) :
%%FORMAT_TEMPLATE%%
    `.trim(),

    COLD_READ: `
%%COLD_READ_PARAMS%%

CONTRÔLES À EFFECTUER (rôle 2 — Contrôleur) :
1. Sujet réel nommé tôt : dans les 3 premières lignes (ou les 2 premières slides), un inconnu sait "de quoi ça parle, pour moi".
2. Ancrage praticien : on comprend que l'auteur est thérapeute au plus tard à la slide 3 (ou dans le premier tiers du texte).
3. Une seule métaphore filée, un seul retournement — pas de deuxième bascule qui dilue.
4. CTA : une seule action, concrète, alignée sur l'objectif fourni, avec l'identité de l'auteur visible (qui il est / où le trouver).
5. Pour un carrousel : titres ≤ 35 caractères, textes ≤ 140 caractères (espaces compris, slide "Signature" exclue). Donne le décompte exact des dépassements.
6. Légende de publication : la première ligne (~125 premiers caractères) parle de la situation du lecteur (pas seulement du conte/de l'image) ; la légende ne répète pas les slides mot pour mot.
7. Zéro emoji, vouvoiement strict du lecteur.

RÈGLES DE SORTIE (FORMAT JSON STRICT) — aucun texte avant ou après le JSON :
{
  "lecture_naive": {
    "sujet": "Ce que je crois que ça raconte, en une phrase d'inconnu.",
    "auteur": "Qui je crois que c'est / à quel moment précis j'ai compris son métier (ou 'jamais').",
    "action": "Ce qu'on me demande de faire à la fin (ou 'rien de clair').",
    "decrochage": "L'endroit où j'aurais arrêté de lire et pourquoi — ou null si je lis jusqu'au bout."
  },
  "controles": [
    { "regle": "Nom court du contrôle", "statut": "OK" | "KO", "detail": "Fait précis (slide N, décompte...)" }
  ],
  "problemes": [
    { "gravite": "Bloquant" | "Important" | "Détail", "localisation": "slide N / paragraphe N / légende / CTA", "probleme": "...", "correction_proposee": "Correction concrète et localisée." }
  ],
  "verdict": "Publiable" | "À retoucher" | "À revoir"
}
Verdict : "Publiable" si aucun problème Bloquant ou Important ; "À retoucher" si des corrections localisées suffisent ; "À revoir" si le problème est structurel (le contenu ne dit pas ce qu'il croit dire).
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

Tu ne touches à AUCUN autre champ : "numero", "role", "type", "titre", "texte", "intention_visuelle" sont recopiés à l'identique. Le bloc racine "legende" (texte, cta, hashtags) est RECOPIÉ À L'IDENTIQUE — tu ne le réécris pas, tu ne le supprimes pas. Tu ne supprimes ni n'ajoutes de slide.

FORMAT DE SORTIE (STRICT) :
{
  "format": "Carrousel",
  "legende": { "texte": "…recopié à l'identique…", "cta": "…recopié…", "hashtags": ["#…"] },
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

    ADJUST_DZINE_PROMPTS: `
Tu reçois :
1. Le JSON complet d'un carrousel — les prompts Dzine en anglais y sont déjà présents sur les slides ILLUSTRÉE.
2. Une instruction d'ajustement en français de Florent (esthétique, style, palette, format, etc.).
3. Une cible :
   - "slide_numero" est un nombre → tu ajustes UNIQUEMENT le prompt_dzine de cette slide.
   - "slide_numero" est null → tu ajustes TOUS les prompts_dzine des slides illustrées du carrousel.

CIBLE COURANTE :
%%PROMPT_TARGET%%

INSTRUCTION DE FLORENT :
%%PROMPT_INSTRUCTION%%

JSON COURANT DU CARROUSEL :
%%SLIDES_JSON%%

RÈGLES STRICTES :
- Tu modifies UNIQUEMENT le(s) champ(s) "prompt_dzine" ciblé(s) par la cible.
- Pour les slides type="TYPO", "prompt_dzine" reste null (jamais d'image).
- Tous les autres champs (numero, role, type, titre, texte, intention_visuelle) sont RECOPIÉS À L'IDENTIQUE.
- Le bloc racine "legende" (texte, cta, hashtags), s'il est présent, est RECOPIÉ À L'IDENTIQUE.
- Le nombre de slides reste identique. Aucune slide ajoutée ni supprimée.
- Les prompts ajustés restent en anglais, 50-80 mots, prêts pour Dzine.
- Les autres prompts_dzine (non ciblés) ne changent pas — recopie-les à l'identique.

Retourne UNIQUEMENT le JSON complet modifié, dans le même format exact que l'original. Zéro texte avant, zéro texte après, zéro bloc markdown.
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
    /** Règles CTA de l'objectif — injectées dans %%OBJECTIF_CTA%% pour DRAFT_CONTENT */
    objectifCta?: string;
    /** Paramètres lecture froide (format, objectif, contenu) — injectés dans %%COLD_READ_PARAMS%% pour COLD_READ */
    coldReadParams?: string;
    /** Profondeur — injectée dans %%PROFONDEUR_INJECTION%% pour GENERATE_INTERVIEW */
    profondeur?: string;
    /** Paramètres carrousel — injectés dans %%CARROUSEL_PARAMS%% pour GENERATE_CARROUSEL_SLIDES */
    carrouselParams?: string;
    /** Contenu actuel — injecté dans %%CURRENT_CONTENT%% pour ADJUST_CONTENT */
    currentContent?: string;
    /** Demande d'ajustement — injectée dans %%ADJUSTMENT_REQUEST%% pour ADJUST_CONTENT */
    adjustmentRequest?: string;
    /** JSON courant des slides — injecté dans %%SLIDES_JSON%% pour ADJUST_DZINE_PROMPTS */
    slidesJson?: string;
    /** Cible humaine de l'ajustement (slide N ou tous) — injectée dans %%PROMPT_TARGET%% */
    promptTarget?: string;
    /** Instruction Florent — injectée dans %%PROMPT_INSTRUCTION%% pour ADJUST_DZINE_PROMPTS */
    promptInstruction?: string;
}

export function buildSystemPrompt(options: BuildOptions): string {
    const { action, notionContext, formatTemplate, objectifCta, coldReadParams, profondeur, carrouselParams, currentContent, adjustmentRequest, slidesJson, promptTarget, promptInstruction } = options;

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
    if (action === 'DRAFT_CONTENT') {
        if (formatTemplate) {
            outputRules = outputRules.replace('%%FORMAT_TEMPLATE%%', formatTemplate);
        }
        outputRules = outputRules.replace('%%OBJECTIF_CTA%%', objectifCta || 'OBJECTIF : non défini — un seul CTA, sobre et concret (une seule action, identité de l\'auteur visible).');
    }
    if (action === 'COLD_READ') {
        outputRules = outputRules.replace('%%COLD_READ_PARAMS%%', coldReadParams || '');
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
    if (action === 'ADJUST_DZINE_PROMPTS') {
        outputRules = outputRules
            .replace('%%PROMPT_TARGET%%', promptTarget || 'Toutes les slides illustrées (slide_numero: null)')
            .replace('%%PROMPT_INSTRUCTION%%', promptInstruction || '')
            .replace('%%SLIDES_JSON%%', slidesJson || '');
    }

    return `${persona}${contextSection}\n\n---\n${outputRules}`;
}

// Ré-exporter les personas pour accès direct si besoin
export { ANALYSTE_PERSONA } from './analyste';
export { INTERVIEWER_PERSONA } from './interviewer';
export { COACH_PERSONA } from './coach';
export { REDACTEUR_PERSONA, REDACTEUR_ADJUSTMENT_INTRO } from './redacteur';
export { ARTISTE_PERSONA } from './artiste';
export { VERROUILLEUR_PERSONA } from './verrouilleur';
export { LECTEUR_FROID_PERSONA } from './lecteurFroid';
