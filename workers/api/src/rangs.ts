/**
 * Les rangs d'une série (SPEC §2.9, v2.36) : 1, 2, 3… sans trou ni doublon.
 *
 * Deux choses ne vivent qu'ici, parce qu'elles doivent dire la même chose
 * partout : l'ordre dans lequel une série se lit, et la manière de réécrire
 * ses rangs.
 */

/**
 * L'ordre d'une série, tel que l'écran la montre. Un contenu sans rang ferme
 * la marche ; à rang égal — un doublon d'avant la v2.36 —, le plus ancien
 * passe d'abord, et `rowid` départage deux créations de la même milliseconde
 * (un plan de série crée tout son lot au même instant).
 */
export const ORDRE_DANS_LA_SERIE = 'serie_position IS NULL, serie_position ASC, created_at ASC, rowid ASC';

/**
 * Pose les rangs 1 à n d'une série, dans l'ordre des identifiants donnés.
 *
 * UNE requête, quel que soit le nombre de contenus : la liste voyage en un seul
 * paramètre JSON que `json_each` déplie. Un `CASE id WHEN ? THEN …` aurait
 * coûté deux paramètres par contenu, et D1 en borne le nombre par requête.
 *
 * Seuls les contenus dont le rang CHANGE sont réécrits — et leur `updated_at`
 * avance, pour que la synchronisation incrémentale les voie passer (SPEC §8).
 * `contents.serie_id = ?` garde la série : un identifiant étranger à la série
 * n'est jamais touché, même s'il s'était glissé dans la liste.
 */
export const renumeroter = (db: D1Database, serieId: string, ids: string[], ts: number) =>
  db.prepare(
    `UPDATE contents SET serie_position = CAST(j.key AS INTEGER) + 1, updated_at = MAX(updated_at + 1, ?)
       FROM json_each(?) AS j
      WHERE contents.id = j.value AND contents.serie_id = ? AND contents.deleted_at IS NULL
        AND contents.serie_position IS NOT CAST(j.key AS INTEGER) + 1`,
  ).bind(ts, JSON.stringify(ids), serieId);

/**
 * Resserre la série d'un contenu — 1 à n, dans l'ordre où elle se lit — sans
 * avoir à la relire : la place de chacun se calcule dans la requête. C'est ce
 * qu'il faut après une suppression, qui laissait un trou (v2.36). Le contenu
 * supprimé garde son `serie_id`, ce qui désigne la série ; `deleted_at` l'en
 * écarte. Sans série, rien n'est touché.
 */
export const resserrerLaSerieDe = (db: D1Database, contentId: string, ts: number) =>
  db.prepare(
    `UPDATE contents SET serie_position = r.rang, updated_at = MAX(updated_at + 1, ?)
       FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY ${ORDRE_DANS_LA_SERIE}) AS rang
               FROM contents
              WHERE serie_id = (SELECT serie_id FROM contents WHERE id = ?) AND deleted_at IS NULL) AS r
      WHERE contents.id = r.id AND contents.serie_position IS NOT r.rang`,
  ).bind(ts, contentId);
