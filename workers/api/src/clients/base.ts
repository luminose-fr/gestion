/**
 * La base des clients, ou un refus (SPEC §14.2, règles 1 et 2).
 *
 * **Le seul endroit du dépôt où `env.CLIENTS` est lu.** Tout ce qui touche à
 * la base des clients passe par ici ; un test parcourt les sources et échoue si
 * la liaison est nommée ailleurs. Aucun module éditorial — IA, corpus, export,
 * montage, accès du serveur MCP — n'importe `src/clients/`, même indirectement.
 *
 * La liaison est FACULTATIVE : absente, la route reçoit un `Refus` 409, que
 * `onError` sert tel quel dans `error` sans rien journaliser — une base non
 * reliée n'est pas une panne, c'est l'état normal de la production jusqu'à la
 * phase S4.
 */
import { Refus } from '../refus';
import type { Env } from '../env';

export const MESSAGE_NON_RELIEE = "La base des clients n'est pas reliée à cet environnement.";

/** La base des clients de cet environnement, ou le refus 409. */
export const baseClients = (env: Pick<Env, 'CLIENTS'>): D1Database => {
  const base = env.CLIENTS;
  if (!base) throw new Refus(MESSAGE_NON_RELIEE, 409);
  return base;
};

/** Ce que la console affiche : la base est-elle reliée ? Aucune requête. */
export const clientsReliee = (env: Pick<Env, 'CLIENTS'>): boolean => env.CLIENTS !== undefined;
