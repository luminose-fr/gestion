/**
 * Les entrées que gestion ouvrira à la porte (SPEC §14.3) — des types, pas de
 * code. La phase S2b les exposera par des classes `WorkerEntrypoint` ; elles
 * vivent ici pour que la porte n'importe rien de `workers/api`.
 *
 * Une entrée reçoit l'envoi tel qu'il est arrivé (`unknown`) : gestion le
 * revalide (« zod à la frontière » — une liaison de service est une frontière).
 * Une panne n'est pas une réponse : l'entrée lève, la porte sert un 5xx.
 */
import type { Reponse } from './reponses.ts';

/**
 * L'autorisation refusée sur la porte de service : distincte d'un refus du
 * contrat, que Make pourrait prendre pour une réponse à son envoi. La porte la
 * sert en 401.
 */
export type AutorisationRefusee = { autorisation: 'refusee' };

export interface PortePublique {
  /** `POST /v1/questionnaire…` (contrat §3.2). Toujours `{ ok: true }` quand il est enregistré. */
  questionnaire(envoi: unknown): Promise<Reponse>;
}

export interface PorteService {
  /**
   * `POST /service/v1/confirmations` (contrat §4.2). `autorisation` : l'en-tête
   * `Authorization` tel que reçu, ou `null`.
   */
  confirmation(autorisation: string | null, envoi: unknown): Promise<Reponse | AutorisationRefusee>;
}

/**
 * L'entrée de l'essai à blanc (SPEC §14.3, phase S2b, partie A) : deux Workers,
 * une liaison, une méthode, aucune donnée. Elle dit seulement que l'appel a
 * traversé, et si la base des clients est reliée de l'autre côté. Elle se retire
 * au dernier commit de la phase, avec sa liaison : une entrée qui ne sert plus
 * est une surface de trop.
 */
export type ReponseEssai = { ok: true; base: boolean };

export interface EntreeEssai {
  ping(): Promise<ReponseEssai>;
}
