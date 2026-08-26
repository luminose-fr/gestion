/**
 * Ce que chaque rôle reçoit vraiment.
 *
 * L'écran Personas montrait cinq textes de persona figés. Or aucun modèle ne
 * reçoit un persona seul : il reçoit un prompt COMPOSÉ — persona, règles de
 * voix, grille de format, règles de CTA — et, depuis le corpus, une feuille de
 * salle en préambule. Un écran de vérification qui montre autre chose que ce
 * qui part est pire que pas d'écran.
 *
 * D'où ce module : il rejoue `getSystemInstruction()` action par action, avec
 * les mêmes fonctions que l'application appelle en production. Ce qui varie
 * d'un appel à l'autre — le format, l'objectif, le texte à retoucher — est
 * remplacé par un exemple, et l'exemple est NOMMÉ à l'écran (`exemple`).
 * Sans ce nommage, l'aperçu redeviendrait un texte figé qui a l'air vrai.
 *
 * La feuille de salle, elle, n'est pas recomposée ici : elle est demandée au
 * Worker (`/api/corpus/feuille/:action`), qui est celui qui la préfixe.
 */
import {
    AI_ACTION_CATALOG, AI_ACTIONS, TargetFormat, Objectif,
    getFormatPromptTemplate, getObjectifCtaRules,
} from '@luminose/editorial';

export interface ApercuAction {
    /** L'identifiant technique — celui qui décide de la feuille de salle. */
    id: string;
    persona: string;
    label: string;
    /** Ce qui a été substitué pour l'aperçu. `null` = ce prompt ne varie pas. */
    exemple: string | null;
    prompt: string;
}

/** Le format et l'objectif servant d'exemple aux actions qui en dépendent. */
const FORMAT_EXEMPLE = TargetFormat.POST_TEXTE_COURT;
const OBJECTIF_EXEMPLE = Objectif.EDUCATION;

const EXTRAIT = '{ "titre": "…", "corps": "…" }';

/**
 * Rejoue une action avec des arguments d'exemple.
 *
 * Les cas sont écrits un par un, sans `any` ni appel générique : les signatures
 * diffèrent, et c'est précisément ce que le compilateur doit continuer de
 * vérifier. Une action ajoutée au catalogue sans être traitée ici tombe dans
 * le `default` et le dit à l'écran plutôt que de disparaître.
 */
function rejouer(id: string): { prompt: string; exemple: string | null } {
    switch (id) {
        case 'ANALYZE_BATCH':
            return { prompt: AI_ACTIONS.ANALYZE_BATCH.getSystemInstruction(), exemple: null };

        case 'COACH_CHAT':
            return {
                prompt: AI_ACTIONS.COACH_CHAT.getSystemInstruction(),
                exemple: 'Hors série. En série, un préambule d’anti-répétition s’ajoute en tête.',
            };

        case 'LOCK_BRIEF':
            return {
                prompt: AI_ACTIONS.LOCK_BRIEF.getSystemInstruction(),
                exemple: 'Hors série. En série, un préambule d’anti-répétition s’ajoute en tête.',
            };

        case 'DRAFT_CONTENT':
            return {
                prompt: AI_ACTIONS.DRAFT_CONTENT.getSystemInstruction(FORMAT_EXEMPLE, OBJECTIF_EXEMPLE),
                exemple: `Format « ${FORMAT_EXEMPLE} », objectif « ${OBJECTIF_EXEMPLE} », hors série. La grille de format et les règles de CTA changent avec eux.`,
            };

        case 'ADJUST_CONTENT':
            return {
                prompt: AI_ACTIONS.ADJUST_CONTENT.getSystemInstruction(
                    EXTRAIT,
                    'Raccourcis l’accroche.',
                    getFormatPromptTemplate(FORMAT_EXEMPLE) || '',
                    getObjectifCtaRules(OBJECTIF_EXEMPLE),
                ),
                exemple: `Texte et demande d’ajustement fictifs ; grille du format « ${FORMAT_EXEMPLE} », objectif « ${OBJECTIF_EXEMPLE} ».`,
            };

        case 'COLD_READ':
            return {
                prompt: AI_ACTIONS.COLD_READ.getSystemInstruction(
                    FORMAT_EXEMPLE,
                    OBJECTIF_EXEMPLE,
                    '(le texte à relire prend place ici)',
                ),
                exemple: `Format « ${FORMAT_EXEMPLE} », objectif « ${OBJECTIF_EXEMPLE} », première passe. Aux passes suivantes, l’historique des corrections déjà obtenues s’ajoute.`,
            };

        case 'GENERATE_CARROUSEL_SLIDES':
            return {
                prompt: AI_ACTIONS.GENERATE_CARROUSEL_SLIDES.getSystemInstruction(
                    '(la métaphore centrale)',
                    EXTRAIT,
                ),
                exemple: 'Métaphore et contenu du carrousel fictifs.',
            };

        case 'ADJUST_DZINE_PROMPTS':
            return {
                prompt: AI_ACTIONS.ADJUST_DZINE_PROMPTS.getSystemInstruction(
                    EXTRAIT,
                    'Plus de lumière rasante.',
                    null,
                ),
                exemple: 'Carrousel et instruction fictifs, cible « toutes les slides ».',
            };

        case 'PLAN_SERIES':
            return { prompt: AI_ACTIONS.PLAN_SERIES.getSystemInstruction(), exemple: null };

        default:
            return {
                prompt: '',
                exemple: `Aperçu non écrit pour « ${id} » — à ajouter dans components/Settings/apercus.ts.`,
            };
    }
}

/** Les neuf actions du flux, dans l'ordre où elles interviennent. */
export const APERCUS: ApercuAction[] = AI_ACTION_CATALOG.map(a => {
    const { prompt, exemple } = rejouer(a.id);
    return { id: a.id, persona: a.persona, label: a.label, prompt, exemple };
});

/** Combien de ces neuf prompts contiennent ce bloc — pour les règles de voix. */
export const compterPresences = (bloc: string): number =>
    APERCUS.filter(a => a.prompt.includes(bloc.trim().slice(0, 120))).length;
