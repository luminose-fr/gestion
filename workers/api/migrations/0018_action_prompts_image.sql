-- L'action « Prompts d'image » change d'identifiant (SPEC v2.37, 16/11/2026).
--
-- `ADJUST_DZINE_PROMPTS` portait le nom de l'outil où Florent collait les
-- prompts d'image. Il l'a quitté : il génère désormais ses visuels dans ChatGPT,
-- ou dans la console avec un modèle d'Illustrer. L'action s'appelle
-- `ADJUST_IMAGE_PROMPTS`, un nom qui ne désigne aucun outil.
--
-- Deux tables portent l'identifiant :
--
--   1. `app_settings` — le modèle réglé pour cette action seule, sous la clé
--      `action_model:<ACTION>`. Laissé sous l'ancien nom, `/api/settings/actions`
--      l'écarterait comme une action inconnue, et l'action retomberait sans un
--      mot sur le modèle de sa famille.
--   2. `mesures_ia` — les appels déjà mesurés. Laissés sous l'ancien nom, ils
--      couperaient la série en deux dans Réglages → Mesures, qui regroupe par
--      action.
--
-- Le journal des productions (`generations`) ne porte pas d'action : il n'est
-- pas touché, et ne doit pas l'être (SPEC §2.6). Les brouillons gardent l'ancien
-- nom de leur champ de prompt, que `packages/editorial` lit encore : une ligne
-- du journal ne se réécrit pas, une migration n'y suffirait donc pas.
--
-- `OR IGNORE`, puis le `DELETE` : si un réglage existait déjà sous le nouveau nom,
-- c'est lui qui vaut, et l'ancien disparaît au lieu de faire échouer la migration.
UPDATE OR IGNORE app_settings
   SET key = 'action_model:ADJUST_IMAGE_PROMPTS'
 WHERE key = 'action_model:ADJUST_DZINE_PROMPTS';

DELETE FROM app_settings WHERE key = 'action_model:ADJUST_DZINE_PROMPTS';

UPDATE mesures_ia SET action = 'ADJUST_IMAGE_PROMPTS' WHERE action = 'ADJUST_DZINE_PROMPTS';
