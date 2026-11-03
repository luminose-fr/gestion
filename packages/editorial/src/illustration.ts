/**
 * L'illustration de la métaphore, générée (SPEC §12.3, v2.28).
 *
 * Décision de Florent, le 28/10/2026 : « éviter au max d'avoir besoin d'ajouter
 * des photos », et « essayons de rester dans le style du site ; si c'est trop
 * contraignant et trop monotone, on fera évoluer ça ». L'image se génère donc
 * comme les illustrations des pages de luminose.fr : avec l'étalon joint, et la
 * formule de `_ai_helpers/prompts-images-luminose.md` (§7) — le sujet en
 * quelques phrases, le cadrage, aucun texte, le format.
 *
 * Ce module compose le prompt ; il n'appelle personne. Le Worker le transmet au
 * modèle d'image choisi, le navigateur montre l'image, et Florent la garde ou la
 * refait. Les modèles d'image sont au catalogue depuis le 03/11/2026
 * (migration 0014) : ils se règlent dans Réglages comme les autres.
 */
import type { IllustrationReel } from './reelExplique';

/** Vertical, pour un écran qui l'est : l'image se recadre ensuite sur ses zones. */
export const FORMAT_ILLUSTRATION = '3:4';

/**
 * Le prompt d'une illustration. Avec `depuis`, c'est l'autre état de la même
 * scène : la seconde image jointe est la première illustration, à reprendre
 * telle quelle sauf ce que la description change.
 */
export function promptIllustration(illustration: IllustrationReel, depuis?: IllustrationReel | null): string {
    const sujet = illustration.description.trim();
    const tete = depuis
        ? `Nouvelle image — la première image jointe sert uniquement de référence de style, de palette et de grain ; la seconde est la scène à reprendre : même lieu, même cadrage, mêmes éléments, même personnage, aux mêmes places. Ne change que ce que dit la description : ${sujet}`
        : `Nouvelle image indépendante — l'image jointe sert uniquement de référence de style, de palette et de grain : ${sujet}`;
    return [
        tete,
        "Une scène figurative, vue à distance moyenne, chaque élément à la place que la description lui donne, avec de l'espace autour : l'image sera recadrée sur ses zones — haut, bas, gauche, droite, centre.",
        'Silhouettes stylisées, sans traits de visage détaillés. Pas de représentation littérale de la détresse, pas de symboles ésotériques appuyés. Pas de schéma, pas de courbe, pas de flèche. Aucun texte, aucune lettre, aucun logo.',
        `Format vertical ${FORMAT_ILLUSTRATION}.`,
    ].join('\n\n');
}
