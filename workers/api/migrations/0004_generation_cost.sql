-- Ce que chaque appel IA a coûté (SPEC §2.6).
--
-- Le journal disait déjà QUI a produit quoi ; il ne disait pas ce que ça a
-- coûté. Sans cette mesure, « ce contenu revient-il cher ? » et « faut-il
-- changer de modèle ? » se répondaient à l'intuition.
--
-- Les trois colonnes sont NULLABLES, et le resteront : tous les fournisseurs ne
-- comptent pas, et aucun ne compte pareil. 1min.ai ne rend aucun décompte ;
-- OpenAI rend des jetons sans prix ; OpenRouter rend les deux. Une ligne sans
-- chiffre est une ligne dont on ne sait rien — pas une ligne gratuite, et
-- l'écran doit pouvoir faire la différence.
ALTER TABLE generations ADD COLUMN prompt_tokens     INTEGER;
ALTER TABLE generations ADD COLUMN completion_tokens INTEGER;
ALTER TABLE generations ADD COLUMN cost_usd          REAL;
