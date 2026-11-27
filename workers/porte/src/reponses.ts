/**
 * Ce que la porte rend — trois formes, et rien d'autre (SPEC §14.5) : une
 * réponse JSON en 200, une panne en 5xx au corps vide, une adresse inconnue en
 * 404 au corps vide.
 *
 * MÊMES EN-TÊTES SUR TOUS LES CHEMINS (§14.2, règle 4) : une réponse qui en
 * porterait un de plus, ou de moins, selon le chemin parcouru dirait quelque
 * chose de ce chemin.
 */
const ENTETES: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

const reponse = (statut: number, corps: string | null) => new Response(corps, { status: statut, headers: ENTETES });

/** Le corps est RE-SÉRIALISÉ par l'appelant depuis une forme vérifiée : jamais recopié. */
export const json = (corps: unknown) => reponse(200, JSON.stringify(corps));
export const panne = () => reponse(503, null);
export const introuvable = () => reponse(404, null);

/**
 * Une panne se journalise par un code fixe, et par rien d'autre (règle 7) : ni
 * l'exception d'origine, qui peut citer l'envoi, ni l'adresse appelée.
 */
export type CodePanne = 'porte.panne' | 'porte.non_reliee' | 'porte.reponse_hors_schema';
export const journaliser = (code: CodePanne) => console.error(code);
