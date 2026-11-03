-- Le journal de chaque écriture que le serveur MCP fait dans les contenus de la
-- console (décision du 03/11/2026, decisions/2026-11-03-contenus.md) : un
-- contenu créé, une fiche modifiée, un brouillon écrit, des idées regroupées
-- en série.
--
-- Mêmes règles que les journaux 0001 à 0003 : la ligne s'écrit AVANT l'appel
-- à la console (`en_cours`) et se clôt APRÈS (`ok` ou `erreur`) ; si elle ne
-- s'écrit pas, la console n'est pas appelée. Une différence : ces écritures
-- partent directement, sans aperçu ni jeton — Florent l'a choisi le
-- 03/11/2026 —, d'où `jeton_empreinte` facultatif.
--
-- Une table À PART : son plafond sur 24 heures est le sien
-- (CONTENUS_ECRITURES_MAX_JOUR). Le journal des générations de la console
-- garde les brouillons ; celui-ci garde, en plus, la fiche d'avant chaque
-- modification, qu'aucun autre journal ne retient.
CREATE TABLE contenus_ecritures (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,

  created_at       INTEGER NOT NULL,   -- ms, horloge du Worker
  closed_at        INTEGER,            -- NULL tant que la ligne est en_cours

  outil            TEXT NOT NULL,      -- contenus_creer, contenus_modifier, contenus_brouillon_ecrire, series_regrouper
  contenu_vise     TEXT NOT NULL,      -- l'identifiant du contenu, « nouveau », ou « série »
  auteur           TEXT NOT NULL,      -- l'adresse certifiée par Google à la connexion

  -- Ce qui part chez la console, tel quel, et pour une modification la fiche
  -- telle qu'elle était juste avant.
  contenu          TEXT NOT NULL,

  jeton_empreinte  TEXT UNIQUE,        -- NULL : pas de jeton d'aperçu pour ces écritures

  issue            TEXT NOT NULL DEFAULT 'en_cours'
                   CHECK (issue IN ('en_cours', 'ok', 'erreur')),
  ressources       TEXT,               -- JSON : les identifiants créés ou modifiés
  erreur           TEXT                -- le refus de la console, en clair, quand issue = 'erreur'
);

CREATE INDEX idx_contenus_ecritures_date ON contenus_ecritures(created_at);
