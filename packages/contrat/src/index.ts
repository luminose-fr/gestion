/**
 * @luminose/contrat — le contrat /v1 en schémas zod (SPEC §14.3).
 *
 * Ce que le site, gestion et Make s'envoient. Dépend de `zod`, et de rien
 * d'autre : ni `workers/`, ni `packages/pratique` — la porte l'importe sans
 * rien importer de gestion. Il porte ce que la phase S2a utilise ; le reste du
 * contrat arrivera avec ses phases. Ses exemples (`exemples/`) sont des
 * fixtures : chacun passe son schéma, un test le vérifie.
 */
export * from './reponses.ts';
export * from './briques.ts';
export * from './questionnaire.ts';
export * from './make.ts';
export * from './valider.ts';
export type * from './entrees.ts';
