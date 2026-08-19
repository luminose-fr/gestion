/**
 * packages/shared — les formes qui traversent la frontière.
 *
 * Ce package décrit ce qui est STOCKÉ et ce qui TRANSITE, là où
 * @luminose/editorial décrit la méthode. Il en importe le vocabulaire
 * (TargetFormat, Objectif…) mais jamais l'inverse : editorial reste au plus
 * bas de la pile (SPEC §1.1).
 *
 * Les schémas zod sont la frontière de l'API (SPEC §3.1) : toute entrée est
 * validée ici avant d'atteindre la logique. À l'intérieur, on fait confiance
 * aux types.
 */
export * from './entities';
export * from './api';
