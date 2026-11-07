-- Les rangs d'une série sont continus, 1 à n (SPEC §2.9, v2.36) — une fois
-- pour toutes les séries qui existent déjà.
--
-- Trois chemins y laissaient des trous ou des doublons avant la v2.36 :
-- allonger une série depuis son plan (les nouvelles publications repartaient
-- du n° 1), supprimer une publication (le trou restait), et un contenu
-- rattaché à la main, sans rang. Le déplacement remet en ordre les séries
-- qu'il touche ; celle-ci remet en ordre les autres, sans changer l'ordre dans
-- lequel l'écran les montrait : par rang, un contenu sans rang en fin, puis par
-- date de création (`ORDRE_DANS_LA_SERIE`, workers/api/src/rangs.ts).
--
-- Seules les lignes dont le rang change sont écrites, et leur `updated_at`
-- avance : la synchronisation incrémentale (§8) doit les voir passer, sans
-- quoi un cache garderait l'ancienne numérotation. Un contenu supprimé n'a
-- plus de place dans une série : il n'est pas touché.
UPDATE contents
   SET serie_position = r.rang,
       updated_at = MAX(updated_at + 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000)
  FROM (SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY serie_id
                 ORDER BY serie_position IS NULL, serie_position ASC, created_at ASC, rowid ASC
               ) AS rang
          FROM contents
         WHERE serie_id IS NOT NULL AND deleted_at IS NULL) AS r
 WHERE contents.id = r.id AND contents.serie_position IS NOT r.rang;
