-- SPEC v2.0 Annexe A — schéma initial.
--
-- RAPPEL (CLAUDE.md règle 4) : une migration appliquée n'est JAMAIS modifiée.
-- Toute évolution passe par un nouveau fichier numéroté.
--
-- Conventions (SPEC §2) :
--   • snake_case en base, camelCase en TypeScript — conversion dans src/db.ts
--   • horodatage en epoch millisecondes (INTEGER), jamais en texte ISO
--   • deleted_at NULL = ligne vivante ; une suppression est un UPDATE
--   • les charges JSON restent du TEXT : la base ne les interprète pas

CREATE TABLE series (
  id                TEXT PRIMARY KEY,
  titre             TEXT NOT NULL,
  intention         TEXT,
  statut            TEXT NOT NULL DEFAULT 'en_cours',   -- en_cours | terminee
  source_content_id TEXT,                               -- FK posée en 0002 (dépendance croisée)
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  deleted_at        INTEGER
);

CREATE TABLE contents (
  id                 TEXT PRIMARY KEY,
  title              TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL,                     -- Idée | Brouillon | Prêt | Publié
  platforms          TEXT NOT NULL DEFAULT '[]',        -- tableau JSON (SPEC §2.8)
  target_format      TEXT,
  objectif           TEXT,
  depth              TEXT,

  -- Produit par l'Analyste
  analyzed_at        INTEGER,                           -- NULL = jamais analysé (SPEC §2.8)
  verdict            TEXT,
  strategic_angle    TEXT,
  justification      TEXT,
  suggested_metaphor TEXT,

  -- Matière et productions courantes (JSON pur, sans signature — SPEC §2.3, §2.6)
  notes              TEXT NOT NULL DEFAULT '',
  draft              TEXT,                              -- LE brouillon, tous formats (SPEC §2.5)
  slides             TEXT,                              -- enrichissement carrousel

  -- Session Coach : état seul ; les messages sont dans coach_messages (SPEC §2.7)
  coach_status       TEXT,                              -- in_progress | validated
  coach_format_cible TEXT,
  coach_brief        TEXT,
  coach_validated_at INTEGER,

  -- Séries (SPEC §2.9)
  serie_id           TEXT REFERENCES series(id) ON DELETE SET NULL,
  angle              TEXT,

  scheduled_date     TEXT,                              -- date ISO, sans heure
  legacy_json        TEXT,                              -- matière de l'ancien flow Interviewer
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  deleted_at         INTEGER
);

-- Journal des productions IA (SPEC §2.6).
-- Une ligne n'est jamais modifiée ni supprimée : c'est un fait daté.
CREATE TABLE generations (
  id          TEXT PRIMARY KEY,
  content_id  TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,        -- analysis | draft | slides | cold_read
                                    -- | adjustment | brief | plan_series
  target      TEXT,                 -- colonne visée : draft | slides (NULL sinon)
  model_id    TEXT,                 -- peut pointer un modèle supprimé depuis
  model_label TEXT NOT NULL,        -- figé à l'écriture : survit à la suppression du modèle
  instruction TEXT,
  payload     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- Conversation Coach (SPEC §2.7) — append-only : un message écrit ne se perd plus.
CREATE TABLE coach_messages (
  id               TEXT PRIMARY KEY,
  content_id       TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  role             TEXT NOT NULL,                       -- user | assistant
  content          TEXT NOT NULL,
  raw              TEXT,
  quick_replies    TEXT NOT NULL DEFAULT '[]',          -- tableau JSON
  ready_for_editor INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL
);

CREATE TABLE ai_models (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  api_code        TEXT NOT NULL,
  provider        TEXT NOT NULL DEFAULT 'onemin',       -- adaptateur appelé (SPEC §5.3)
  vendor          TEXT,                                 -- affichage
  cost            TEXT,
  strengths       TEXT,
  best_use_cases  TEXT,
  text_quality    INTEGER,
  is_default      INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);

CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Synchronisation incrémentale (SPEC §8)
CREATE INDEX idx_contents_updated   ON contents(updated_at);
CREATE INDEX idx_series_updated     ON series(updated_at);
CREATE INDEX idx_models_updated     ON ai_models(updated_at);
-- Listes filtrées, contenus d'une série (SPEC §3.3)
CREATE INDEX idx_contents_status    ON contents(status)   WHERE deleted_at IS NULL;
CREATE INDEX idx_contents_serie     ON contents(serie_id) WHERE deleted_at IS NULL;
-- Dernière génération d'une nature pour un contenu (SPEC §2.6)
CREATE INDEX idx_generations_lookup ON generations(content_id, kind, created_at DESC);
CREATE INDEX idx_coach_messages     ON coach_messages(content_id, created_at);
