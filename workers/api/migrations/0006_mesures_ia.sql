-- Ce que chaque APPEL au modèle a coûté : en jetons, et en temps.
--
-- Pourquoi une table de plus, alors que `generations` porte déjà les jetons
-- depuis 0004 : `generations` est le journal des PRODUCTIONS — des lignes vers
-- lesquelles on peut revenir, avec leur charge utile. Trois choses n'y entrent
-- pas, et ce sont exactement les trois qui manquaient le 30/08 pour régler les
-- budgets de réflexion.
--
--   1. LE COACH. Ses tours vivent dans `coach_messages` et ne sont journalisés
--      nulle part. L'action dont Florent s'est plaint en premier était la seule
--      qu'on ne pouvait pas mesurer.
--   2. LES ÉCHECS. Un appel qui meurt au bout de cinq minutes ne produit rien,
--      donc n'écrit aucune ligne — alors que c'est la mesure la plus parlante
--      qui soit : sans elle, on ne voit jamais la reprise de `avecUneReprise`
--      doubler une attente.
--   3. LA DURÉE. Elle vivait dans le `localStorage` du navigateur, où elle
--      remplissait la barre de progression et rien d'autre. Deux postes de
--      travail, deux mémoires ; et un plafond à dix minutes qui écartait
--      précisément les appels les plus lents.
--
-- Jetons et durée décrivent le MÊME événement. Séparés, on ne peut pas calculer
-- un débit — et « 18 073 jetons en 594 secondes », le chiffre qui a tranché le
-- diagnostic du 30/08, a dû être reconstitué à la main dans l'inspecteur réseau.
--
-- L'écriture a lieu au point de passage obligé (`/api/ai/chat`), APRÈS la
-- réponse : aucun appel n'attend sa propre mesure, et une mesure perdue ne fait
-- échouer personne.
CREATE TABLE mesures_ia (
  id                TEXT PRIMARY KEY,

  -- L'identifiant technique de l'action (`DRAFT_CONTENT`, `COACH_CHAT`…), que
  -- le front envoie déjà pour choisir la feuille de salle. NULL quand
  -- l'appelant n'en donne pas : le champ est facultatif côté schéma, et le
  -- rester ici est ce qui garde la marche arrière intacte.
  action            TEXT,

  -- Le format visé, quand l'appelant le connaît. C'est lui qui décidera des
  -- budgets : un carrousel, un script court et un article long ne méritent pas
  -- la même réflexion, et `FORMAT_REGISTRY` est l'endroit où cette différence
  -- s'écrira (règle n°3 du CLAUDE.md).
  format            TEXT,

  model_id          TEXT,               -- peut pointer un modèle supprimé depuis
  model_label       TEXT NOT NULL,      -- figé à l'écriture, comme dans generations
  provider          TEXT NOT NULL,      -- l'adaptateur appelé (SPEC §5.3)

  -- Tout est NULLABLE pour les mêmes raisons qu'en 0004 : les fournisseurs ne
  -- comptent pas tous, et aucun ne compte pareil. NULL veut dire « on ne sait
  -- pas », jamais « zéro ».
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  cost_usd          REAL,

  -- Aucun plafond ici, contrairement à l'estimateur du navigateur : un appel de
  -- douze minutes est une donnée, pas une aberration à écarter.
  duree_ms          INTEGER NOT NULL,

  -- Taille de la feuille de salle jointe, en caractères ; zéro quand le rôle
  -- n'en reçoit pas (le Lecteur froid, l'Artiste). C'est ce qui permettra de
  -- répondre « la feuille pèse-t-elle sur la durée ? » par une corrélation
  -- plutôt que par une intuition.
  feuille_car       INTEGER NOT NULL DEFAULT 0,

  ok                INTEGER NOT NULL,   -- 0 = le fournisseur a refusé, ou est tombé
  erreur            TEXT,               -- son message, en clair, quand ok = 0

  created_at        INTEGER NOT NULL
);

CREATE INDEX idx_mesures_action ON mesures_ia(action, created_at);
CREATE INDEX idx_mesures_modele ON mesures_ia(model_id, created_at);
