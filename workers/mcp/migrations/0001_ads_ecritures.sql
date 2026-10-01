-- Le journal de chaque écriture que le serveur MCP fait dans Google Ads
-- (cadrage écriture du 01/10/2026, verrou V7).
--
-- Une base À PART (`luminose-mcp`), pas une table de plus dans celle de la
-- console : la base de la console porte les clés des fournisseurs IA (SPEC
-- §5.5), et le Worker MCP ne partage avec workers/api ni code, ni secret, ni
-- binding (SPEC §1.1). Une erreur de configuration ici ne doit rien pouvoir y
-- lire.
--
-- La ligne s'écrit AVANT l'appel à Google (`en_cours`) et se clôt APRÈS (`ok`
-- ou `erreur`). Si elle ne s'écrit pas, Google n'est pas appelé : une écriture
-- qui touche au compte sans laisser de trace n'est pas acceptable. C'est
-- l'inverse de `mesures_ia`, où une mesure perdue ne fait échouer personne.
--
-- Les aperçus (`validateOnly`) ne s'écrivent pas ici : ils n'ont pas d'effet.
CREATE TABLE ads_ecritures (
  -- Un compteur, et non un UUID : « écriture n° 12 » se lit et se cite.
  id               INTEGER PRIMARY KEY AUTOINCREMENT,

  created_at       INTEGER NOT NULL,   -- ms, horloge du Worker
  closed_at        INTEGER,            -- NULL tant que la ligne est en_cours

  outil            TEXT NOT NULL,      -- ads_negatifs_ajouter, ads_mettre_en_pause…
  compte           TEXT NOT NULL,      -- dix chiffres
  auteur           TEXT NOT NULL,      -- l'adresse certifiée par Google à la connexion

  -- Ce qui part chez Google, tel quel : `{ service, operations }`. C'est le
  -- contenu exact que le jeton d'aperçu a couvert.
  contenu          TEXT NOT NULL,

  -- Empreinte SHA-256 du jeton d'aperçu. UNIQUE : un jeton ne sert qu'une fois,
  -- et c'est la base qui le garantit — l'insertion échoue, Google n'est pas
  -- appelé. Un jeton dont l'exécution a échoué ne se rejoue pas non plus : on
  -- refait un aperçu.
  jeton_empreinte  TEXT NOT NULL UNIQUE,

  issue            TEXT NOT NULL DEFAULT 'en_cours'
                   CHECK (issue IN ('en_cours', 'ok', 'erreur')),
  ressources       TEXT,               -- JSON : les resourceName rendus par Google
  erreur           TEXT                -- le message de Google, en clair, quand issue = 'erreur'
);

-- Le plafond de volume (V9) compte les écritures des dernières 24 heures.
CREATE INDEX idx_ads_ecritures_date ON ads_ecritures(created_at);
