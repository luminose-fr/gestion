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

// Les Séries — plan de publication et anti-répétition (SPEC §6)
export * from './series';

// La relecture à froid, et la mémoire de ses propres passes (SPEC §3.5.2)
export * from './coldRead';

// Le choix des modèles — courte liste et paliers de prix (SPEC §5.6)
export * from './shortlist';

// Composition des prompts et parsing des réponses
export * from './prompts';
export * from './actions';
export * from './executors';
