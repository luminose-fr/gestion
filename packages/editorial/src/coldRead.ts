/**
 * La relecture à froid, et sa mémoire.
 *
 * Le Lecteur froid est SANS MÉMOIRE, et c'est voulu : il doit lire avec les
 * yeux d'un inconnu. Mais sans rien savoir des passes précédentes, il condamne
 * à la passe N+1 la phrase qu'il a lui-même dictée à la passe N — c'est arrivé
 * deux fois de suite sur le même carrousel le 24/08/2026 :
 *
 *   passe 3 → « Remplacer le texte de la slide 5 par : "On ne passe pas la
 *              scène par-dessus pour filer aux coulisses…" »
 *   passe 4 → « "On ne passe pas la scène par-dessus pour filer aux
 *              coulisses" : la métaphore tourne à vide, je relis deux fois et
 *              je ne sais toujours pas ce que ça veut dire. »
 *
 * Une phrase écrite par un critique pour cocher une case est rarement une bonne
 * phrase en contexte : il la relit, elle ne passe pas, il en dicte une autre.
 * Rien n'arrête ça.
 *
 * On ne lui rend donc pas la mémoire du contenu — on lui rend la mémoire de SES
 * PROPRES DEMANDES, et la règle qui va avec.
 */

/**
 * L'en-tête de l'instruction envoyée au Rédacteur quand Florent applique les
 * corrections. Il sert DEUX fois : à composer l'instruction, et à reconnaître
 * dans le journal les ajustements qui viennent d'une relecture. D'où la
 * constante — deux chaînes recopiées finissent toujours par diverger.
 */
export const COLD_READ_APPLY_PREFIX =
    "Applique ces corrections issues d'une relecture à froid, sans rien changer d'autre :";

export const buildColdReadApplyInstruction = (corrections: string): string =>
    `${COLD_READ_APPLY_PREFIX}\n${corrections}`;

export const isColdReadApplyInstruction = (instruction: string | null | undefined): boolean =>
    typeof instruction === 'string' && instruction.startsWith(COLD_READ_APPLY_PREFIX);

export const stripColdReadApplyPrefix = (instruction: string): string =>
    instruction.slice(COLD_READ_APPLY_PREFIX.length).trim();

/**
 * Ce que le Lecteur froid reçoit de ses passes précédentes.
 *
 * `passes` porte, dans l'ordre chronologique, les corrections qu'il a dictées
 * et qui ONT ÉTÉ APPLIQUÉES. Une liste vide rend une chaîne vide : une première
 * relecture reçoit exactement le prompt qu'elle recevait avant cette mémoire.
 */
export const buildColdReadHistorySection = (passes: string[]): string => {
    const utiles = passes.map(p => (p ?? '').trim()).filter(Boolean);
    if (utiles.length === 0) return '';

    const corps = utiles
        .map((corrections, i) => `--- Passe ${i + 1}, appliquée telle quelle ---\n${corrections}`)
        .join('\n\n');

    return [
        `TES PASSES PRÉCÉDENTES SUR CE CONTENU (tu en es à la relecture n°${utiles.length + 1})`,
        '',
        'Les corrections ci-dessous sont LES TIENNES. Elles ont été appliquées telles que tu',
        'les as dictées : le texte que tu relis les contient.',
        '',
        corps,
        '',
        'RÈGLE — elle prime sur le reste de ta rigueur :',
        '• Une phrase que tu as toi-même dictée, tu ne la rejettes QUE si tu peux dire en quoi',
        "  elle est PIRE que ce qu'elle remplaçait. Sinon tu la laisses — même si tu l'écrirais",
        "  autrement aujourd'hui. Sans cette règle, chaque passe défait la précédente et le",
        '  contenu tourne sans jamais sortir.',
        '• Un point que tu as déjà obtenu ne se rouvre pas sous un autre nom.',
        "• S'il ne reste rien de Bloquant ni d'Important, dis-le : « Publiable ». C'est le but",
        '  de ces passes, pas un aveu de complaisance.',
    ].join('\n');
};
