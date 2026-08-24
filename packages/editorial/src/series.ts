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

import { TargetFormat, Objectif, isObjectif } from './domain';
import { resoudreFormat } from './formats';

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
    /**
     * La matière de cette publication : ce qu'elle doit contenir, prélevé du
     * pilier ou du thème.
     *
     * Sans elle, un contenu de série naissait vide — un titre et un angle,
     * rien à quoi l'Atelier puisse mordre. C'est ce champ qui remplit
     * `contents.notes`, celui-là même que Florent écrirait à la main.
     */
    notes: string;
}

export const emptyPlanEntry = (): PlanSeriesEntry => ({
    titre: '',
    angle: '',
    format: null,
    objectif: null,
    justification: '',
    notes: '',
});

/**
 * Une ligne sans titre ne peut pas devenir un contenu : c'est le seul champ
 * dont l'absence est bloquante. Tout le reste s'ajoute plus tard, à la main
 * comme dans l'Atelier.
 */
/**
 * Une ligne qui mérite sa place dans le tableau du plan : elle a un titre.
 *
 * Volontairement PLUS LARGE que `isPlanEntryCreatable` — c'est ce filtre qui
 * s'applique à la réponse de l'Éclateur, et une ligne sans format doit rester
 * visible pour que Florent la complète. La faire disparaître en silence serait
 * exactement le contraire de ce qu'on cherche.
 */
export const isPlanEntryUsable = (entry: PlanSeriesEntry): boolean =>
    entry.titre.trim().length > 0;

/**
 * Une ligne qui peut devenir un contenu : titre ET format.
 *
 * Le format est exigé ICI, au dernier moment où il est encore gratuit à
 * choisir. Passé la création, il ne se modifie plus que tant que le statut vaut
 * Idée — et « Travailler cette idée » referme cette porte définitivement. Un
 * contenu créé sans format traverse donc le flux amputé de son Brouillon, de sa
 * Copie, de ses Slides, sans que rien ne le dise.
 */
export const isPlanEntryCreatable = (entry: PlanSeriesEntry): boolean =>
    isPlanEntryUsable(entry) && entry.format !== null;

/** Normalise une ligne de plan venue de l'extérieur (IA ou saisie). */
export const normalizePlanEntry = (raw: unknown): PlanSeriesEntry => {
    const source = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    return {
        titre: str(source.titre),
        angle: str(source.angle),
        // Le format est RÉSOLU, pas comparé à l'identique : « Script Video
        // (Reel / Short) » désigne le même format que la valeur du registre, et
        // jeter l'intention du modèle sur un accent serait absurde (§6.2).
        format: resoudreFormat(source.format),
        objectif: isObjectif(source.objectif) ? source.objectif : null,
        justification: str(source.justification),
        notes: str(source.notes),
    };
};

// ── Anti-répétition — NORMATIF (SPEC §6.4) ───────────────────────────────

/**
 * Un contenu frère, tel que le Rédacteur a le droit de le connaître :
 * son titre et son angle, JAMAIS son texte.
 *
 * La restriction est structurelle, pas déclarative : le type ne porte pas de
 * champ où glisser le brouillon d'un frère. Sans elle, le prompt croîtrait
 * avec la série et finirait par noyer la consigne.
 */
export interface SerieSibling {
    titre: string;
    angle?: string | null;
    /** Rang dans la série — ce qui fait la progression (SPEC §2.9). */
    position?: number | null;
}

export interface SerieContext {
    /** Le sujet de la série. */
    titre: string;
    intention?: string | null;
    /** Texte du contenu pilier — uniquement si la série en a un. */
    sourceText?: string | null;
    freres?: SerieSibling[];
    /** Rang du contenu courant, quand il en a un. */
    position?: number | null;
    /** Titre du contenu courant — pour le situer dans la liste des frères. */
    titreCourant?: string | null;
}

/**
 * Le texte du pilier entre en entier dans le prompt ; au-delà de cette taille
 * il est coupé. Un article de 40 000 signes recopié devant la grille de
 * production ferait perdre au modèle la consigne qui compte.
 */
export const SERIE_SOURCE_MAX = 6000;

/**
 * Le bloc que le Rédacteur reçoit EN PLUS quand le contenu appartient à une
 * série (SPEC §6.4) : le thème et l'intention, le texte du pilier s'il existe,
 * et les angles des frères — leurs titres et leurs angles, jamais leur texte.
 */
export const buildSerieContextSection = (serie: SerieContext): string => {
    const lines: string[] = [
        `CONTEXTE DE SÉRIE — CE CONTENU N'EST PAS SEUL :`,
        `Il appartient à une série. Cela ne change pas ta mission — tu rédiges CE contenu, en entier — mais délimite son territoire.`,
        ``,
        `• Sujet de la série : ${serie.titre}`,
        `• Intention de la série : ${serie.intention?.trim() || 'non précisée'}`,
    ];

    const source = serie.sourceText?.trim();
    if (source) {
        const troncature = source.length > SERIE_SOURCE_MAX
            ? `\n[…texte coupé au-delà de ${SERIE_SOURCE_MAX} caractères]`
            : '';
        lines.push(
            ``,
            `TEXTE DU CONTENU PILIER (la série en est la déclinaison) :`,
            source.slice(0, SERIE_SOURCE_MAX) + troncature,
            `Tu ne le réécris pas et tu ne le résumes pas : tu y prélèves ce dont CE contenu a besoin, et rien d'autre.`,
        );
    }

    const freres = (serie.freres ?? []).filter(f => f.titre.trim() || (f.angle ?? '').trim());

    lines.push(``, `LA SÉRIE, DANS SON ORDRE — TERRITOIRE OCCUPÉ :`);
    if (freres.length === 0) {
        lines.push(`Aucune autre publication n'est encore prévue : le territoire est libre.`);
    } else {
        /**
         * La liste est rendue DANS L'ORDRE, avec le contenu courant à sa
         * place : c'est ce qui transforme un ensemble en progression. Le
         * Rédacteur sait alors ce qui a déjà été dit avant lui, et ce qui
         * viendra après — donc ce qu'il n'a ni à installer ni à conclure.
         */
        const rang = (f: SerieSibling) => (typeof f.position === 'number' ? f.position : Number.MAX_SAFE_INTEGER);
        const courant: SerieSibling = {
            titre: serie.titreCourant?.trim() || '(ce contenu)',
            position: serie.position ?? null,
        };
        const suite = [...freres, courant].sort((a, b) => rang(a) - rang(b));

        suite.forEach((f, index) => {
            const numero = typeof f.position === 'number' ? f.position : index + 1;
            if (f === courant) {
                lines.push(`▶ ${numero}. CELLE QUE TU ÉCRIS MAINTENANT — « ${courant.titre} »`);
                return;
            }
            const titre = f.titre.trim() || '(sans titre)';
            const angle = (f.angle ?? '').trim();
            lines.push(`  ${numero}. « ${titre} » — ${angle || 'angle non précisé'}`);
        });

        lines.push(
            ``,
            `Tu ne reçois QUE leur titre et leur angle, volontairement : ce sont des bornes, pas de la matière.`,
            `N'empiète sur aucun de ces angles — ni en le traitant, ni en le résumant « au passage ». Si ton propos en croise un, une phrase suffit, puis tu reviens au tien.`,
            `Ce qui précède est déjà dit : tu n'as pas à le réinstaller. Ce qui suit viendra : tu n'as pas à le conclure.`,
        );
    }

    return lines.join('\n');
};

// ── Charge utile de l'Éclateur (SPEC §6.2) ───────────────────────────────

/** Ce que l'Éclateur reçoit — la forme est celle décrite dans ses règles de sortie. */
export interface PlanSeriesPayload {
    sujet: string;
    intention: string | null;
    contenu_source: string | null;
    contenus_existants: Array<{ titre: string; angle: string | null; position: number | null }>;
    nombre_souhaite: number;
}

export const buildPlanSeriesPayload = (input: {
    titre: string;
    intention?: string | null;
    sourceText?: string | null;
    /** Les publications déjà prévues : leur territoire est pris. */
    freres?: SerieSibling[];
    nombreSouhaite: number;
}): PlanSeriesPayload => ({
    sujet: input.titre,
    intention: input.intention?.trim() || null,
    // Même plafond qu'à la rédaction : au-delà, le pilier noie la consigne.
    contenu_source: input.sourceText?.trim().slice(0, SERIE_SOURCE_MAX) || null,
    contenus_existants: (input.freres ?? []).map(f => ({
        titre: f.titre,
        angle: (f.angle ?? '').trim() || null,
        position: f.position ?? null,
    })),
    nombre_souhaite: input.nombreSouhaite,
});
