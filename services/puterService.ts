// Ce fichier est conservé uniquement pour éviter les erreurs de build si des références existent encore.
// Toute la logique IA est maintenant centralisée dans aiService.ts (utilisant Puter.js).

export const generateContent = async (): Promise<string> => {
    throw new Error("Deprecated: Use generateContent from aiService.ts instead.");
};