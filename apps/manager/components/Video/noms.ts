import { motsNormalises } from '@luminose/editorial';
import type { FormatVideo } from './SceneLuminose';

/**
 * Les noms des fichiers exportés (SPEC §12.4.1). Le titre du contenu vient en
 * tête : dans un dossier de téléchargements, « reel-9x16.mp4 » ne dit pas de
 * quelle vidéo il s'agit, et la scène 2 d'une vidéo écrasait celle d'une autre
 * (demande de Florent, 28/10/2026).
 */

/** Un nom se lit d'un coup d'œil : le titre s'arrête au mot qui le ferait passer au-delà. */
const LONGUEUR_DU_TITRE = 60;

const titreDuFichier = (titre: string | null | undefined): string => {
    let nom = '';
    for (const mot of motsNormalises(titre)) {
        const suivant = nom ? `${nom}-${mot}` : mot;
        if (suivant.length > LONGUEUR_DU_TITRE) break;
        nom = suivant;
    }
    return nom;
};

export const nomDeVideo = (titre: string | null | undefined, format: FormatVideo, publicite: boolean): string =>
    `${titreDuFichier(titre) || 'reel'}-${format === '9:16' ? '9x16' : '4x5'}${publicite ? '-pub' : ''}.mp4`;

export const nomDeScene = (titre: string | null | undefined, rang: number, role: string): string => {
    const tete = titreDuFichier(titre);
    const mots = motsNormalises(role).join('-');
    return `${tete ? `${tete}-` : ''}scene-${rang}${mots ? `-${mots}` : ''}.mp4`;
};
