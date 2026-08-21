export type Env = {
  DB: D1Database;

  /** Clé de signature des jetons de session. Repli sur AUTH_PASSWORD (SPEC §7). */
  SESSION_SECRET?: string;
  AUTH_USERNAME: string;
  AUTH_PASSWORD: string;

  /**
   * Clés des fournisseurs d'IA, en REPLI : depuis l'administration, elles
   * peuvent être posées en base (voir keys.ts), et la base l'emporte. Aucune
   * ne quitte le Worker dans un cas comme dans l'autre (CLAUDE.md règle 1).
   */
  ONE_MIN_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  /** Encore nécessaire tant que le proxy Notion sert le front (phases 3 à 5). */
  NOTION_API_KEY?: string;
};
