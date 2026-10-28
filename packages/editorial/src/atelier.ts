/**
 * Les questions que le Coach a posées et qui attendent encore Florent
 * (SPEC §13.10).
 *
 * Le 25/10/2026, un « Go » a validé un atelier dont le Coach attendait deux
 * réponses : le titre, et la phrase exacte qu'on entend en séance. Le brief les
 * a rangées en questions ouvertes sans que rien ne le montre, et le Rédacteur a
 * bâti l'accroche sur la phrase que le Coach n'avait proposée qu'en hypothèse.
 * « Go » les rappelle désormais avant de passer la main.
 *
 * Seul compte le dernier message, et seulement si Florent n'y a pas répondu :
 * une question à laquelle il a répondu, même à côté, n'attend plus rien.
 */
export function questionsEnSuspens(messages: ReadonlyArray<{ role: string; content: string }>): string[] {
    const dernier = messages[messages.length - 1];
    if (!dernier || dernier.role !== 'assistant') return [];
    return questionsDuMessage(dernier.content);
}

/**
 * Les phrases interrogatives d'un message du Coach, hors citations.
 *
 * Le Coach cite les répliques qu'il propose entre guillemets, et une réplique
 * peut être une question — « combien de temps encore voulez-vous la tenir ? »
 * est une phrase pour la vidéo, pas une question à Florent. Une phrase ne finit
 * donc pas à l'intérieur de « … ». Une ligne de tableau n'en contient aucune :
 * c'est la carte de la métaphore.
 */
export function questionsDuMessage(message: string): string[] {
    const lignes = message
        .split('\n')
        .filter(l => !l.trim().startsWith('|'))
        .map(l => l.replace(/\*\*|__|`/g, '').replace(/^\s*(?:[-*•>]|\d+\.)\s+/, '').trim());

    const questions: string[] = [];
    for (const ligne of lignes) {
        let phrase = '';
        let cite = 0;
        for (const c of ligne) {
            phrase += c;
            if (c === '«') cite++;
            else if (c === '»') cite = Math.max(0, cite - 1);
            else if (cite === 0 && (c === '.' || c === '!' || c === '?')) {
                if (c === '?') questions.push(phrase.trim());
                phrase = '';
            }
        }
    }
    // « Questions : gardez-vous… » — l'étiquette n'est pas la question.
    return questions.map(q => q.replace(/^questions?\s*:\s*/i, '')).filter(q => q.length > 10);
}
