/**
 * L'Éclateur — génération d'un plan de série (SPEC §6.2).
 *
 * Le service ne fait qu'assembler la charge utile et rendre le plan parsé :
 * la forme du payload comme le parsing appartiennent à @luminose/editorial,
 * au plus près du prompt qui les décrit.
 */
import {
    AI_ACTIONS, buildPlanSeriesPayload, parsePlanSeriesResponse, bodyJsonToText,
    type PlanSeriesEntry, type SerieSibling,
} from '@luminose/editorial';
import * as AiService from './aiService';
import type { ContentItem, Serie } from '../types';

/**
 * Le pilier part en TEXTE, jamais en JSON de production : l'Éclateur planifie,
 * il n'a que faire des champs de la grille de format. À défaut de brouillon,
 * les notes font l'affaire — c'est la matière disponible.
 */
const sourceTextOf = (content: ContentItem | null): string | null => {
    if (!content) return null;
    const draft = bodyJsonToText(content.draft || '').trim();
    return draft || content.notes.trim() || null;
};

export const generateSeriePlan = async (opts: {
    serie: Serie;
    sourceContent: ContentItem | null;
    /** Titres et angles déjà pris — contenus créés ET lignes du tableau en cours. */
    dejaPrevus: SerieSibling[];
    modelId: string;
    nombreSouhaite: number;
}): Promise<PlanSeriesEntry[]> => {
    const { serie, sourceContent, dejaPrevus, modelId, nombreSouhaite } = opts;

    const payload = buildPlanSeriesPayload({
        titre: serie.titre,
        intention: serie.intention,
        sourceText: sourceTextOf(sourceContent),
        freres: dejaPrevus,
        nombreSouhaite,
    });

    // Pas de `json: true` ici, volontairement : le mode JSON natif des API
    // compatibles OpenAI exige un OBJET en sortie, or un plan est un TABLEAU.
    // Le parsing défensif d'editorial fait le travail, comme pour l'Analyste.
    const responseText = await AiService.generateContent({
        modelId,
        systemInstruction: AI_ACTIONS.PLAN_SERIES.getSystemInstruction(),
        prompt: JSON.stringify(payload),
    });

    return parsePlanSeriesResponse(responseText);
};
