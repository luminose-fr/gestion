/**
 * packages/editorial — le moteur éditorial.
 *
 * ZÉRO DÉPENDANCE (SPEC §4). Ni React, ni fetch, ni API Workers : ce package
 * compose des chaînes et en parse. C'est ce qui le rend testable sans réseau
 * ni DOM, et c'est là que vit la valeur du produit.
 */

// Vocabulaire
export * from './domain';
export * from './config';

// Règles de voix transverses
export * from './voice';

// Registres — seules autorités sur leur domaine
export * from './formats';
export * from './objectives';

// Composition des prompts et parsing des réponses
export * from './prompts';
export * from './actions';
export * from './executors';
