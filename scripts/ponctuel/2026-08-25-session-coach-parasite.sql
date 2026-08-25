-- Efface la session Coach parasite née du défaut de `key` sur l'atelier
-- (voir le commit « L'atelier d'une publication ne déborde plus sur la suivante »).
--
-- Publication concernée, la seule dans ce cas au 25/08/2026 :
--   2ba8ccde-2eaa-4de2-8989-ab1b627c2a36
--   « Psychopraticien transpersonnel : ce que ces deux mots veulent dire… »
--   coach_status = in_progress, 2 messages (un brief auto + sa réponse)
--
-- Ces deux instructions reproduisent EXACTEMENT ce que fait « Réinitialiser »
-- dans l'application (DELETE /api/contents/:id/coach) : suppression LOGIQUE des
-- messages, remise à zéro des colonnes de session. Rien n'est détruit — la
-- conversation reste en base avec son `deleted_at`, et dans l'export.
--
-- À exécuter depuis workers/api :
--   . ~/.cf-luminose
--   npx wrangler d1 execute luminose-gestion --remote \
--     --file ../../scripts/ponctuel/2026-08-25-session-coach-parasite.sql
--
-- Pour vérifier AVANT (doit rendre 2), et APRÈS (doit rendre 0) :
--   npx wrangler d1 execute luminose-gestion --remote --command \
--     "SELECT COUNT(*) FROM coach_messages WHERE content_id='2ba8ccde-2eaa-4de2-8989-ab1b627c2a36' AND deleted_at IS NULL"

UPDATE coach_messages
   SET deleted_at = 1787654400000
 WHERE content_id = '2ba8ccde-2eaa-4de2-8989-ab1b627c2a36'
   AND deleted_at IS NULL;

UPDATE contents
   SET coach_status       = NULL,
       coach_brief        = NULL,
       coach_validated_at = NULL,
       coach_format_cible = NULL,
       updated_at         = 1787654400000
 WHERE id = '2ba8ccde-2eaa-4de2-8989-ab1b627c2a36';
