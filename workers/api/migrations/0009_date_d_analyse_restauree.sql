-- Rend leur date d'analyse aux idées qui l'ont perdue.
--
-- Depuis la phase 5, le tiroir d'une idée recopiait la date d'analyse sous
-- l'ancien nom `analyzed` : après une analyse lancée depuis le tiroir, sa copie
-- locale gardait `analyzedAt` à null, et « Enregistrer » renvoyait ce null en
-- base. Le verdict restait affiché, mais l'idée redevenait « à analyser » et
-- « Travailler cette idée » restait grisé — pour de bon, même rouverte.
--
-- La date perdue n'est pas à inventer : l'analyse est journalisée
-- (`generations`, kind = 'analysis'). On reprend la plus récente. Une idée sans
-- trace au journal garde son NULL — mieux vaut la relancer qu'antidater.
UPDATE contents
SET analyzed_at = (
  SELECT MAX(g.created_at) FROM generations g
  WHERE g.content_id = contents.id AND g.kind = 'analysis'
)
WHERE analyzed_at IS NULL
  AND verdict IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM generations g
    WHERE g.content_id = contents.id AND g.kind = 'analysis'
  );
