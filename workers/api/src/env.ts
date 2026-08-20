export type Env = {
  DB: D1Database;

  /** Clé de signature des jetons de session. Repli sur AUTH_PASSWORD (SPEC §7). */
  SESSION_SECRET?: string;
  AUTH_USERNAME: string;
  AUTH_PASSWORD: string;

  /**
   * Clés des fournisseurs d'IA. Aucune ne quitte le Worker (CLAUDE.md règle 1).
   * Le nom suit la convention `<PROVIDER>_API_KEY`, voir routes/ai.ts.
   */
  ONE_MIN_API_KEY: string;
  OPENAI_API_KEY?: string;
  /** Encore nécessaire tant que le proxy Notion sert le front (phases 3 à 5). */
  NOTION_API_KEY?: string;
};
