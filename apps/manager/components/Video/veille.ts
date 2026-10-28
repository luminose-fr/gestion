/**
 * Mener un rendu jusqu'au bout, ou rendre la main (SPEC §12.4.1).
 *
 * Remotion ne regarde le signal d'annulation qu'entre deux étapes. Un rendu
 * figé AU MILIEU d'une étape — dans l'encodeur, le 27/10/2026 sous Safari — ne
 * le voit jamais : « Annuler » restait sans effet, et l'export à 0 % sans un
 * mot. Ici, l'annulation rend la main tout de suite, et un rendu qui ne donne
 * plus signe de vie depuis `delai` est annulé avec l'erreur `fige`.
 *
 * Le travail abandonné n'est pas arrêté pour autant : rien ne l'interrompt de
 * l'extérieur. L'erreur `fige` doit donc dire quoi faire.
 */
export function sousVeille<T>(
    travail: (signeDeVie: () => void) => Promise<T>,
    controle: AbortController,
    delai: number,
    fige: Error,
): Promise<T> {
    let vu = Date.now();
    const veille = setInterval(() => {
        if (Date.now() - vu > delai) controle.abort(fige);
    }, Math.min(5000, delai / 4));
    const abandon = new Promise<never>((_, rejeter) => {
        if (controle.signal.aborted) rejeter(controle.signal.reason);
        controle.signal.addEventListener('abort', () => rejeter(controle.signal.reason), { once: true });
    });
    return Promise.race([travail(() => { vu = Date.now(); }), abandon]).finally(() => clearInterval(veille));
}
