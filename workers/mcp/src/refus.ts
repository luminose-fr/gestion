/**
 * Un refus que l'appelant peut corriger — pas une panne.
 *
 * Même distinction que dans workers/api (voir son refus.ts pour l'histoire) :
 * un secret absent, un compte hors liste, une requête qui n'est pas un SELECT
 * ne s'écrivent pas dans les journaux. Côté outil, le message part tel quel au
 * modèle, avec `isError` : c'est ce qui lui permet de corriger sa demande.
 */
export class Refus extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 503 = 400) {
    super(message);
    this.name = 'Refus';
  }
}
