-- Les gestes de Florent sur un contenu (SPEC §13.6) : « Bon à publier »,
-- « Prête à tourner », « Marquer publié », « Repasser en écriture ».
--
-- Le fil d'un contenu (SPEC §13.7) est le journal des productions rendu
-- lisible. Mais `generations` est réservé à ce que l'IA produit (§2.6), et les
-- gestes, eux, n'étaient tracés nulle part : le statut changeait sur
-- `contents`, sans date ni passé. Le fil n'aurait pas pu dire « Vous · Bon à
-- publier, le 18 oct. ».
--
-- Une ligne par CHANGEMENT de statut, écrite par le Worker lui-même dans la
-- même requête que le changement : aucun écran ne peut l'oublier. `avant` dit
-- d'où l'on venait — « Repasser en écriture » n'est pas « Bon à publier ».
CREATE TABLE gestes (
  id          TEXT PRIMARY KEY,
  content_id  TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  statut      TEXT NOT NULL,               -- le statut posé : Idée | Brouillon | Prêt | Publié
  avant       TEXT NOT NULL,               -- le statut d'avant
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_gestes_contenu ON gestes(content_id, created_at DESC);
