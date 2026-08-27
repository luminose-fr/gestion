/**
 * Un refus que l'appelant peut corriger — pas une panne.
 *
 * Le 21/08/2026, un compte à sec ressortait en « Erreur interne » : le message
 * qui disait quoi faire restait enterré dans `detail`, que personne ne lit.
 * Le cas du fournisseur a été réparé sur place ; le même défaut a survécu sur
 * la clé manquante, et il s'est vu au pire endroit — le message le plus utile
 * de toute l'application (« Renseignez-la dans Réglages → Fournisseurs »)
 * était le seul à ne jamais s'afficher.
 *
 * D'où ce type. Le statut et le message voyagent AVEC l'erreur, si bien que
 * `onError` n'a plus rien à deviner : il sert le message tel quel dans
 * `error` — là où le front le lit — et se tait dans les journaux.
 *
 * Ce qui compte dans le statut n'est pas le code exact mais la famille : un
 * 4xx dit « corrige ta demande », un 5xx dit « quelque chose est cassé ». Les
 * confondre, c'est perdre le seul indicateur qui devrait réveiller quelqu'un.
 */
export class Refus extends Error {
    constructor(message: string, readonly status: 400 | 402 | 403 | 404 | 409 = 400) {
        super(message);
        this.name = 'Refus';
    }
}
