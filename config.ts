// Configuration de l'application
const getEnvVar = (key: string): string => {
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      return import.meta.env[key] || "";
    }
  } catch (e) {
    console.warn("Erreur d'accès aux variables d'environnement:", e);
  }
  return "";
};

export const CONFIG = {
  NOTION_CONTENT_DB_ID: getEnvVar("VITE_NOTION_CONTENT_DB_ID"),
  NOTION_CONTEXT_DB_ID: getEnvVar("VITE_NOTION_CONTEXT_DB_ID"),
  NOTION_MODELS_DB_ID: getEnvVar("VITE_NOTION_MODELS_DB_ID")
};

try {
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV && (!CONFIG.NOTION_CONTENT_DB_ID || !CONFIG.NOTION_CONTEXT_DB_ID || !CONFIG.NOTION_MODELS_DB_ID)) {
    console.warn("⚠️ Certains IDs de bases de données sont manquants dans le .env");
  }
} catch (e) {}