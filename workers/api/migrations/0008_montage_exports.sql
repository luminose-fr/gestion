-- Les vidéos exportées depuis le montage (SPEC §12.4.3).
--
-- L'export se fait dans l'onglet et part en téléchargement : rien, jusque-là,
-- n'en gardait trace. Or c'est ce que l'espace Vidéos doit dire d'un Reel
-- expliqué — « exportée le 04/10, en 9:16 » —, et c'est ce qui dit qu'une prise
-- a fait son office et peut rendre sa place dans R2.
--
-- Un journal plutôt qu'une colonne : un même Reel s'exporte en plusieurs
-- formats et versions, et on veut le dernier sans perdre les autres.
CREATE TABLE montage_exports (
  id          TEXT PRIMARY KEY,
  content_id  TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  format      TEXT NOT NULL,               -- 9:16 | 4:5
  version     TEXT NOT NULL,               -- organique | publicite
  duree       REAL NOT NULL,               -- secondes
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_montage_exports_contenu ON montage_exports(content_id, created_at DESC);
