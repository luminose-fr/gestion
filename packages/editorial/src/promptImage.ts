/**
 * Le prompt d'image d'un Post Texte, ou d'une slide illustrée de carrousel.
 *
 * Il s'appelait `prompt_dzine` jusqu'au 16/11/2026, du nom de l'outil où
 * Florent le collait. Florent a quitté cet outil : le prompt se colle désormais
 * dans ChatGPT, ou part tel quel vers un modèle d'Illustrer (SPEC v2.37). Le
 * champ porte depuis un nom qui ne désigne aucun outil, pour ne plus avoir à
 * changer quand l'outil changera.
 *
 * Les brouillons d'avant portent encore l'ancien nom, et le journal les garde
 * tels quels : une ligne de `generations` ne se réécrit jamais (SPEC §2.6), et
 * restaurer une ancienne version ramène l'ancien nom. Une migration SQL n'y
 * suffirait donc pas. L'ancien nom se LIT ici, et se renomme chaque fois que le
 * JSON repart vers un modèle ou vers la base ; il ne s'écrit plus.
 */

export const CHAMP_PROMPT_IMAGE = 'prompt_image';

/** L'ancien nom, à lire et jamais à écrire. */
const ANCIEN_CHAMP = 'prompt_dzine';

const texte = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Le prompt d'image d'un brouillon ou d'une slide, sous son nom actuel ou l'ancien ; '' sans prompt. */
export const lirePromptImage = (objet: unknown): string => {
    if (!objet || typeof objet !== 'object') return '';
    const o = objet as Record<string, unknown>;
    return texte(o[CHAMP_PROMPT_IMAGE]) || texte(o[ANCIEN_CHAMP]);
};

/**
 * L'objet, l'ancien nom remplacé À SA PLACE : l'ordre des champs est celui que
 * le modèle recopie, le bouleverser l'inviterait à réordonner le reste.
 */
const renommer = (objet: unknown): unknown => {
    if (!objet || typeof objet !== 'object' || Array.isArray(objet) || !(ANCIEN_CHAMP in objet)) return objet;
    const o = objet as Record<string, unknown>;
    // Les deux noms à la fois (un modèle qui a recopié l'ancien en ajoutant le
    // nouveau) : le nouveau est le plus récent, l'ancien disparaît.
    const dejaRenomme = CHAMP_PROMPT_IMAGE in o;
    return Object.fromEntries(Object.entries(o).flatMap(([cle, valeur]) =>
        cle !== ANCIEN_CHAMP ? [[cle, valeur]] : dejaRenomme ? [] : [[CHAMP_PROMPT_IMAGE, valeur]]));
};

/** Un brouillon ou un JSON de slides déjà parsé, ses prompts d'image sous leur nom actuel. */
export const renommerPromptsImage = <T>(data: T): T => {
    const racine = renommer(data) as any;
    if (!racine || typeof racine !== 'object' || !Array.isArray(racine.slides)) return racine;
    return { ...racine, slides: racine.slides.map(renommer) };
};

/**
 * Le même, sur un JSON en texte — celui qu'un ajustement injecte dans son
 * prompt. Rendu à l'octet près quand il n'y a rien à renommer : un brouillon
 * récent part exactement comme avant.
 */
export const renommerPromptsImageJson = (json: string): string => {
    if (!json.includes(`"${ANCIEN_CHAMP}"`)) return json;
    try {
        return JSON.stringify(renommerPromptsImage(JSON.parse(json)), null, 2);
    } catch {
        // Illisible : il part tel quel, comme avant. La lecture, elle, comprend encore l'ancien nom.
        return json;
    }
};
