// Configuration de l'application
// Ces valeurs sont injectées au moment du build par Vite via les GitHub Secrets

// Fonction utilitaire pour accéder aux variables d'environnement en toute sécurité
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
  // Note: La clé API n'est plus nécessaire ici, elle est sécurisée dans le Cloudflare Worker.
  
  NOTION_CONTENT_DB_ID: getEnvVar("VITE_NOTION_CONTENT_DB_ID"),
  
  NOTION_CONTEXT_DB_ID: getEnvVar("VITE_NOTION_CONTEXT_DB_ID")
};

// Vérification de sécurité pour le développement local
try {
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV && (!CONFIG.NOTION_CONTENT_DB_ID || !CONFIG.NOTION_CONTEXT_DB_ID)) {
    console.warn("⚠️ IDs des bases de données manquants. Assurez-vous d'avoir un fichier .env configuré.");
  }
} catch (e) {
  // Ignore les erreurs en prod ou environnement non supporté
}