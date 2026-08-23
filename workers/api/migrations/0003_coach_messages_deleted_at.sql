-- Réinitialiser une session Coach.
--
-- La conversation reste APPEND-ONLY (SPEC §2.7) : réinitialiser ne l'efface
-- pas, il la sort de la vue. C'est la même convention que `contents`, `series`
-- et `ai_models` — et elle vaut ici plus qu'ailleurs, puisqu'on jette une
-- session parce qu'elle s'est mal passée, c'est-à-dire précisément quand on
-- voudra peut-être relire ce qui a été dit.
ALTER TABLE coach_messages ADD COLUMN deleted_at INTEGER;
