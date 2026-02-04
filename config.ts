// Configuration de l'application
// Ces valeurs sont injectées au moment du build par Vite via les GitHub Secrets

// Fonction utilitaire pour accéder aux variables d'environnement en toute sécurité
// Cela empêche le crash "TypeError: undefined is not an object" si import.meta.env n'est pas injecté
const getEnvVar = (key: string): string => {
  try {
    // On vérifie d'abord si import.meta.env est défini
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      return import.meta.env[key] || "";
    }
  } catch (e) {
    // En cas d'erreur d'accès (ex: environnement non module), on retourne une chaîne vide
    console.warn("Erreur d'accès aux variables d'environnement:", e);
  }
  return "";
};

export const CONFIG = {
  // Les variables d'environnement Vite doivent commencer par VITE_
  NOTION_API_KEY: getEnvVar("VITE_NOTION_API_KEY"),
  
  NOTION_CONTENT_DB_ID: getEnvVar("VITE_NOTION_CONTENT_DB_ID"),
  
  NOTION_CONTEXT_DB_ID: getEnvVar("VITE_NOTION_CONTEXT_DB_ID")
};

// Vérification de sécurité pour le développement local
try {
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV && !CONFIG.NOTION_API_KEY) {
    console.warn("⚠️ Aucune clé API trouvée. Assurez-vous d'avoir un fichier .env ou des variables d'environnement configurées.");
  }
} catch (e) {
  // Ignore les erreurs en prod ou environnement non supporté
}