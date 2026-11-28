-- Retours du 28/11/2026 (§4) : un stage sur plusieurs jours, chacun avec ses
-- heures — « sam. 14 mars, 10:00 – 17:00 · dim. 15 mars, 10:00 – 16:00 ».
--
-- `debut` et `fin` restent la vérité des listes, des places et du site : le
-- début du premier jour, la fin du dernier. `jours` les détaille, en JSON
-- ([{ "debut": ms, "fin": ms }, …], dans l'ordre) ; vide, le stage tient en
-- `debut`–`fin`, comme avant.
ALTER TABLE evenements ADD COLUMN jours TEXT;
