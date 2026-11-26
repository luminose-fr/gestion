/**
 * Les données sensibles (SPEC §14.2, règle 3).
 *
 * **Le seul fichier de code qui nomme leurs tables.** Un test parcourt
 * `workers/*\/src`, `packages/*` et `apps/*` et échoue si un autre fichier en
 * écrit une. Les migrations, les tests, le jeu d'essai et la spécification sont
 * hors de ce contrôle.
 *
 * Pourquoi un seul module : ces données ne sortent par aucun chemin — ni le
 * serveur MCP, ni l'IA, ni l'export général, ni les journaux, ni le stockage du
 * navigateur. Tant que leurs noms ne s'écrivent qu'ici, la liste de ce qui les
 * lit se relit en un seul fichier.
 *
 * Dans la phase S1, rien ne les lit ni ne les écrit : ce module n'expose que la
 * liste, dont les tests ont besoin. Les lectures et les écritures arriveront
 * ici, avec les écrans.
 */
export const TABLES_SENSIBLES = [
  'questionnaires',
  'seances_notes',
  'seances_reponses',
  'clients_confiance',
  'clients_notes',
] as const;

export type TableSensible = (typeof TABLES_SENSIBLES)[number];
