-- Les modèles d'image entrent au catalogue (03/11/2026, SPEC §5.3).
--
-- Jusqu'ici, Nano Banana Pro, Nano Banana 2 et GPT Image 2 étaient écrits en
-- dur dans packages/editorial (MODELES_ILLUSTRATION) : ni visibles dans
-- Réglages → Modèles IA, ni modifiables, et l'on ne savait pas par où ils
-- passaient. Ils deviennent des lignes du catalogue comme les autres, que
-- distingue leur sortie.
--
-- `sortie` : ce que le modèle produit. Un modèle de texte écrit, un modèle
-- d'image illustre ; les menus de l'un ne proposent jamais l'autre.
ALTER TABLE ai_models ADD COLUMN sortie TEXT NOT NULL DEFAULT 'texte'
  CHECK (sortie IN ('texte', 'image'));

-- Les trois modèles d'avant, amorcés tels qu'ils étaient : tous par OpenRouter,
-- le seul adaptateur qui sache rendre une image. Identifiants fixes, pour que
-- la migration ne crée rien deux fois ; un modèle déjà au catalogue sous le
-- même code n'est pas recopié.
INSERT INTO ai_models (id, name, api_code, provider, vendor, cost, is_default, sortie, created_at, updated_at)
SELECT 'image-nano-banana-pro', 'Nano Banana Pro', 'google/gemini-3-pro-image', 'openrouter', 'Google', 'high', 0, 'image', 1793664000000, 1793664000000
WHERE NOT EXISTS (SELECT 1 FROM ai_models WHERE api_code = 'google/gemini-3-pro-image' AND deleted_at IS NULL);

INSERT INTO ai_models (id, name, api_code, provider, vendor, cost, is_default, sortie, created_at, updated_at)
SELECT 'image-nano-banana-2', 'Nano Banana 2', 'google/gemini-3.1-flash-image', 'openrouter', 'Google', 'medium', 0, 'image', 1793664000001, 1793664000001
WHERE NOT EXISTS (SELECT 1 FROM ai_models WHERE api_code = 'google/gemini-3.1-flash-image' AND deleted_at IS NULL);

INSERT INTO ai_models (id, name, api_code, provider, vendor, cost, is_default, sortie, created_at, updated_at)
SELECT 'image-gpt-image-2', 'GPT Image 2', 'openai/gpt-image-2', 'openrouter', 'OpenAI', 'high', 0, 'image', 1793664000002, 1793664000002
WHERE NOT EXISTS (SELECT 1 FROM ai_models WHERE api_code = 'openai/gpt-image-2' AND deleted_at IS NULL);
