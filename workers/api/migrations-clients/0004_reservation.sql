-- Phase R1 (SPEC §14.12) : réserver depuis le site.
--
-- Une réservation est une commande de la porte publique, comme un
-- questionnaire : la sorte `reservation` s'ajoute à la liste. SQLite ne change
-- pas la contrainte d'une colonne : la table est refaite, à l'identique sauf
-- cette liste, et ses lignes recopiées.

CREATE TABLE commandes_r1 (
  id          TEXT PRIMARY KEY,
  porte       TEXT NOT NULL CHECK (porte IN ('publique', 'service')),
  cle         TEXT NOT NULL,
  sorte       TEXT NOT NULL CHECK (sorte IN ('questionnaire', 'confirmation', 'reservation')),
  objet_type  TEXT,
  objet_id    TEXT,
  empreinte   TEXT NOT NULL,
  recu        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
INSERT INTO commandes_r1 (id, porte, cle, sorte, objet_type, objet_id, empreinte, recu, created_at, updated_at)
  SELECT id, porte, cle, sorte, objet_type, objet_id, empreinte, recu, created_at, updated_at FROM commandes;
DROP TABLE commandes;
ALTER TABLE commandes_r1 RENAME TO commandes;
CREATE UNIQUE INDEX idx_commandes_cle ON commandes(porte, cle);
CREATE INDEX idx_commandes_created ON commandes(created_at);
CREATE INDEX idx_commandes_objet ON commandes(objet_type, objet_id);

-- La borne des réservations, sur 24 heures glissantes (§14.5). Horodatage : le 27/11/2026.
INSERT INTO reglages (cle, valeur, created_at, updated_at) VALUES
  ('commandes_reservation_max_jour', 30, 1795737600000, 1795737600000);
