-- Le journal de chaque écriture que le serveur MCP fait dans Google Tag Manager
-- (décision du 09/10/2026, decisions/2026-10-09-gtm-ecriture.md) : un
-- déclencheur ou une balise créé dans l'espace de travail « [Claude] » du
-- conteneur — et l'espace lui-même, quand l'écriture l'a ouvert.
--
-- Mêmes règles que `ads_ecritures` (0001) et `corpus_ecritures` (0002) : la
-- ligne s'écrit AVANT l'appel à Tag Manager (`en_cours`) et se clôt APRÈS
-- (`ok` ou `erreur`) ; si elle ne s'écrit pas, Tag Manager n'est pas appelé.
-- Le jeton d'aperçu ne sert qu'une fois, et c'est l'unicité de
-- `jeton_empreinte` qui le garantit.
--
-- Une table À PART : son plafond sur 24 heures est le sien
-- (GTM_ECRITURES_MAX_JOUR), et l'histoire d'un conteneur ne se mêle pas à
-- celle d'un compte ni d'un dépôt.
CREATE TABLE gtm_ecritures (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,

  created_at       INTEGER NOT NULL,   -- ms, horloge du Worker
  closed_at        INTEGER,            -- NULL tant que la ligne est en_cours

  outil            TEXT NOT NULL,      -- gtm_declencheur_creer, gtm_conversion_creer, gtm_evenement_ga4_creer
  conteneur        TEXT NOT NULL,      -- GTM-…, l'identifiant public
  auteur           TEXT NOT NULL,      -- l'adresse certifiée par Google à la connexion

  -- Ce qui part chez Tag Manager, tel quel : l'espace visé (ou « à créer »),
  -- la nature de l'élément et son corps entier. C'est le contenu exact que le
  -- jeton d'aperçu a couvert.
  contenu          TEXT NOT NULL,

  jeton_empreinte  TEXT NOT NULL UNIQUE,

  issue            TEXT NOT NULL DEFAULT 'en_cours'
                   CHECK (issue IN ('en_cours', 'ok', 'erreur')),
  ressources       TEXT,               -- JSON : les liens Tag Manager de l'espace ouvert et de l'élément créé
  erreur           TEXT                -- le refus de Tag Manager, en clair, quand issue = 'erreur'
);

CREATE INDEX idx_gtm_ecritures_date ON gtm_ecritures(created_at);
