/**
 * Les Séries — le plan de publication (SPEC §6).
 *
 * Une série regroupe plusieurs contenus autour d'un thème ; avec ou sans
 * contenu pilier, c'est le même objet — seule change la provenance de la
 * matière (SPEC §2.9).
 *
 * Ce module ne connaît ni la base, ni le réseau : il décrit la FORME d'une
 * ligne de plan, celle que l'Éclateur produit et que l'écran de plan édite
 * avant la création en lot.
 */

import { TargetFormat, isTargetFormat, Objectif, isObjectif } from './domain';

/**
 * Une ligne du plan de publication : un futur contenu de la série.
 *
 * `angle` est l'angle propre de ce contenu AU SEIN de la série — c'est lui qui
 * garantit que deux publications d'une même série ne se marchent pas dessus
 * (SPEC §6.4). Il ne remplace pas l'angle stratégique de l'Analyste : les deux
 * cohabitent, l'un venant du plan, l'autre de l'analyse.
 */
export interface PlanSeriesEntry {
    titre: string;
    angle: string;
    format: TargetFormat | null;
    objectif: Objectif | null;
    justification: string;
}

export const emptyPlanEntry = (): PlanSeriesEntry => ({
    titre: '',
    angle: '',
    format: null,
    objectif: null,
    justification: '',
});

/**
 * Une ligne sans titre ne peut pas devenir un contenu : c'est le seul champ
 * dont l'absence est bloquante. Tout le reste s'ajoute plus tard, à la main
 * comme dans l'Atelier.
 */
export const isPlanEntryUsable = (entry: PlanSeriesEntry): boolean =>
    entry.titre.trim().length > 0;

/** Normalise une ligne de plan venue de l'extérieur (IA ou saisie). */
export const normalizePlanEntry = (raw: unknown): PlanSeriesEntry => {
    const source = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    return {
        titre: str(source.titre),
        angle: str(source.angle),
        // Un format ou un objectif hors vocabulaire est ramené à null plutôt
        // que recopié : la ligne reste utilisable, Florent choisira.
        format: isTargetFormat(source.format) ? source.format : null,
        objectif: isObjectif(source.objectif) ? source.objectif : null,
        justification: str(source.justification),
    };
};
