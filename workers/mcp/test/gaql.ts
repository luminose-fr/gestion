/**
 * La règle GAQL du serveur : tout champ que WHERE ou ORDER BY référence figure
 * dans le SELECT.
 *
 * Google ne l'exige que pour certaines ressources — sur `campaign_asset` et
 * `ad_group_asset`, filtrer sur `campaign.id` ou `ad_group.campaign` sans les
 * sélectionner rend queryError.EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE
 * (incident du 04/10/2026, workers/mcp/README.md). Le serveur l'applique à
 * toutes ses requêtes : sélectionner un champ de plus ne coûte rien, et une
 * règle sans exception se vérifie. Les simulateurs de l'API la font respecter
 * aussi : sans cela, ils acceptaient ce que Google refuse.
 */

export type Gaql = { select: string[]; from: string; references: string[] };

const FORME = /^\s*SELECT\s+([\s\S]+?)\s+FROM\s+([a-z_]+)\b([\s\S]*)$/;
const CHAMP = /\b[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+\b/g;

/** Le SELECT, la ressource, et les champs référencés après FROM. `null` : pas une requête GAQL lisible. */
export const lireGaql = (requete: string): Gaql | null => {
  const m = FORME.exec(requete);
  if (!m) return null;
  // Après FROM : WHERE, ORDER BY, LIMIT. Ce qui est entre guillemets est une valeur, pas un champ.
  const reste = m[3].replace(/'[^']*'|"[^"]*"/g, "''").replace(/\bPARAMETERS\b[\s\S]*$/, '');
  return {
    select: m[1].split(',').map((c) => c.trim()),
    from: m[2],
    references: [...new Set([...reste.matchAll(CHAMP)].map((x) => x[0]))],
  };
};

/** Les champs référencés après FROM qui manquent au SELECT. */
export const horsSelect = (requete: string): string[] => {
  const g = lireGaql(requete);
  return g ? g.references.filter((r) => !g.select.includes(r)) : [];
};

/** Ce que Google répond à une requête qui enfreint la règle — ou rien. Pour les simulateurs. */
export const refusGaql = (requete: string): Response | undefined => {
  const [champ] = horsSelect(requete);
  if (!champ) return undefined;
  return Response.json({ error: {
    code: 400, status: 'INVALID_ARGUMENT', message: 'Request contains an invalid argument.',
    details: [{ errors: [{
      errorCode: { queryError: 'EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE' },
      message: `The following field must be present in SELECT clause: '${champ}'.`,
    }] }],
  } }, { status: 400 });
};
