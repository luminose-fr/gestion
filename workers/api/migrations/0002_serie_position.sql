-- Une série est une PROGRESSION, pas un ensemble (SPEC §2.9).
--
-- Sans rang, « publication 3 sur 6 » ne peut se dire ni à l'écran ni dans le
-- prompt du Rédacteur : chaque contenu ignore ce qui le précède, et la série
-- se lit dans l'ordre où la base la rend — c'est-à-dire dans aucun ordre.
--
-- NULL est admis : un contenu rattaché à une série à la main n'a pas encore
-- de place, et il ferme la marche plutôt que de bloquer l'écriture.
ALTER TABLE contents ADD COLUMN serie_position INTEGER;
