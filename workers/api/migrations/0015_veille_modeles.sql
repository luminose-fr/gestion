-- La veille des modèles (03/11/2026, SPEC §5.7).
--
-- Une fois par jour, le Worker lit la liste de chaque adaptateur suivi et y
-- cherche une version plus récente d'un modèle du catalogue. Ce qu'il trouve
-- s'écrit ici, et Réglages le montre : « Ajouter au catalogue » ou « Ignorer ».
--
-- `id` vaut `provider:api_code` : une proposition par code et par adaptateur,
-- que la veille met à jour au lieu de la doubler.
-- `ignore_le` : posé par « Ignorer ». La ligne reste, pour que la proposition
-- ne revienne pas le lendemain ; une version plus récente, elle, reviendra.
-- `remplace_*` : le modèle du catalogue que celui-ci dépasse, copié pour que
-- l'écran puisse le nommer même s'il a été retiré depuis.
CREATE TABLE veille_modeles (
  id                TEXT PRIMARY KEY,
  provider          TEXT NOT NULL,
  api_code          TEXT NOT NULL,
  nom               TEXT NOT NULL,
  remplace_model_id TEXT,
  remplace_nom      TEXT,
  publie_le         INTEGER,
  detecte_le        INTEGER NOT NULL,
  ignore_le         INTEGER
);
