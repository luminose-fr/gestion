/**
 * Ce que la porte rend — trois formes, et rien d'autre (SPEC §14.5) : un corps
 * JSON en 200 (réussite ou refus), une panne en 5xx au corps vide, et les
 * statuts de la porte elle-même (403, 404, 413, 415, 401), au corps vide.
 *
 * MÊMES EN-TÊTES SUR TOUS LES CHEMINS D'UNE MÊME ROUTE (§14.2, règle 4) : une
 * réponse qui en porterait un de plus, ou de moins, selon le chemin parcouru
 * dirait quelque chose de ce chemin. Chaque route fixe son jeu une fois
 * (`entetesDe`), et toutes ses réponses le portent.
 */
export type Entetes = Record<string, string>;

export const ENTETES_DE_BASE: Entetes = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

/** Le corps est RE-SÉRIALISÉ par l'appelant depuis une forme vérifiée : jamais recopié. */
export const json = (corps: unknown, entetes: Entetes = ENTETES_DE_BASE) =>
  new Response(JSON.stringify(corps), { status: 200, headers: entetes });

export const vide = (statut: number, entetes: Entetes = ENTETES_DE_BASE) =>
  new Response(null, { status: statut, headers: entetes });

export const panne = (entetes: Entetes = ENTETES_DE_BASE) => vide(503, entetes);
export const introuvable = () => vide(404);

/**
 * Une panne se journalise par un code fixe, et par rien d'autre (règle 7) : ni
 * l'exception d'origine, qui peut citer l'envoi, ni l'adresse appelée, ni
 * l'adresse IP, ni l'en-tête `Authorization`.
 */
export type CodePanne =
  | 'porte.panne'
  | 'porte.non_reliee'
  | 'porte.non_configuree'
  | 'porte.reponse_hors_schema'
  | 'porte.delai'
  | 'porte.limite';
export const journaliser = (code: CodePanne) => console.error(code);
