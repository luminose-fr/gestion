-- Le montage d'un Reel expliqué, rangé chez Cloudflare (SPEC §12.4, v2.8).
--
-- Jusqu'au 04/10/2026, prises et visuels vivaient dans le navigateur. Florent a
-- tranché pour Cloudflare : un montage doit survivre à des données de site
-- vidées, et se reprendre depuis un autre poste. Les FICHIERS vont dans R2
-- (bucket `luminose-montage`, liaison MONTAGE) ; ce qui les décrit, la
-- transcription et les repères corrigés vivent ici.
--
-- La transcription reste du JSON en TEXT, comme les autres charges (§2.3) : sa
-- forme appartient à Whisper et à `packages/shared`, pas à la base.

CREATE TABLE montage_prises (
  id            TEXT PRIMARY KEY,
  content_id    TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,                -- principale | accroche
  nom           TEXT NOT NULL,                -- le nom du fichier déposé
  type          TEXT NOT NULL,                -- son type MIME
  taille        INTEGER NOT NULL,             -- octets
  duree         REAL NOT NULL,                -- secondes
  largeur       INTEGER NOT NULL,
  hauteur       INTEGER NOT NULL,
  -- L'objet dans R2. Neuf à CHAQUE dépôt : un cache local qui le connaît sait
  -- qu'il tient la bonne version, sans comparer des centaines de mégaoctets.
  r2_cle        TEXT NOT NULL,
  -- L'envoi en plusieurs parties en cours ; NULL une fois le fichier entier.
  envoi_id      TEXT,
  pret_le       INTEGER,                      -- NULL tant que l'envoi n'est pas terminé
  transcription TEXT,                         -- JSON {mots, texte, duree}
  transcrite_le INTEGER,
  -- JSON {"séquence:élément": secondes dans la prise}. Il passe d'une prise à
  -- celle qui la remplace : on remplace souvent une prise par sa version mieux
  -- nettoyée, et c'est Florent qui a vu la vidéo.
  reperes       TEXT NOT NULL DEFAULT '{}',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);

-- Une prise vivante par rôle et par contenu : la remplacer, c'est retirer l'ancienne.
CREATE UNIQUE INDEX idx_montage_prises_role ON montage_prises(content_id, role) WHERE deleted_at IS NULL;

CREATE TABLE montage_visuels (
  id          TEXT PRIMARY KEY,
  content_id  TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  sequence    INTEGER NOT NULL,
  element     INTEGER NOT NULL,
  -- La description à laquelle l'image répondait : une rédaction suivante peut
  -- changer la carte, et l'écran le signale plutôt que de poser une image sur
  -- une description qui n'est plus la sienne.
  description TEXT NOT NULL,
  type        TEXT NOT NULL,
  taille      INTEGER NOT NULL,
  r2_cle      TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);

CREATE UNIQUE INDEX idx_montage_visuels_place ON montage_visuels(content_id, sequence, element) WHERE deleted_at IS NULL;
