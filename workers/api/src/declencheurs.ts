/**
 * Les déclencheurs planifiés, nommés en un seul endroit (SPEC §14.7).
 *
 * Le plan gratuit en donne cinq par compte, recette comprise : le gestionnaire
 * `scheduled` distingue les siens par leur expression, et `wrangler.toml` ne
 * doit déclarer que celles-ci — le contrôle de la recette
 * (scripts/configuration.ts) et la suite de tests le vérifient.
 *
 *   - la veille des modèles (§5.7), une fois par jour, en production ;
 *   - le passage des portes (§14.6) — relever les ordres, compléter les fiches,
 *     purger les reçus —, toutes les cinq minutes, en recette seulement tant
 *     que la liaison `CLIENTS` n'existe pas en production.
 */
export const DECLENCHEURS = {
  veille: '17 5 * * *',
  passage: '*/5 * * * *',
} as const;
