-- Le journal de chaque écriture que le serveur MCP fait dans le corpus
-- (décision du 03/10/2026, decisions/2026-10-03-corpus.md) : un commit sur le
-- dépôt, ou le lancement du déploiement qui le publie.
--
-- Mêmes règles que `ads_ecritures` (0001) : la ligne s'écrit AVANT l'appel à
-- GitHub (`en_cours`) et se clôt APRÈS (`ok` ou `erreur`) ; si elle ne s'écrit
-- pas, GitHub n'est pas appelé. Le jeton d'aperçu ne sert qu'une fois, et
-- c'est l'unicité de `jeton_empreinte` qui le garantit.
--
-- Une table À PART plutôt que des lignes de plus dans `ads_ecritures` : son
-- plafond sur 24 heures est le sien (CORPUS_ECRITURES_MAX_JOUR) — une série de
-- corrections du corpus ne doit pas épuiser celui des écritures Google Ads, ni
-- l'inverse — et l'histoire d'un dépôt ne se mêle pas à celle d'un compte.
CREATE TABLE corpus_ecritures (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,

  created_at       INTEGER NOT NULL,   -- ms, horloge du Worker
  closed_at        INTEGER,            -- NULL tant que la ligne est en_cours

  outil            TEXT NOT NULL,      -- corpus_modifier, corpus_decision_ajouter, corpus_deployer
  depot            TEXT NOT NULL,      -- luminose-fr/gestion
  auteur           TEXT NOT NULL,      -- l'adresse certifiée par Google à la connexion

  -- Ce qui part chez GitHub, tel quel : le fichier entier et l'empreinte qu'il
  -- remplace, ou le déploiement et le commit qu'il publie. C'est le contenu
  -- exact que le jeton d'aperçu a couvert.
  contenu          TEXT NOT NULL,

  jeton_empreinte  TEXT NOT NULL UNIQUE,

  issue            TEXT NOT NULL DEFAULT 'en_cours'
                   CHECK (issue IN ('en_cours', 'ok', 'erreur')),
  ressources       TEXT,               -- JSON : le commit, ou le lien du workflow
  erreur           TEXT                -- le refus de GitHub, en clair, quand issue = 'erreur'
);

CREATE INDEX idx_corpus_ecritures_date ON corpus_ecritures(created_at);
