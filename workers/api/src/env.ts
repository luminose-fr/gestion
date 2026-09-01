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

  /**
   * Jeton GitHub à portée réduite — dépôt `luminose-fr/gestion` seul, droits
   * « Contents: write » (commiter le corpus) et « Actions: write » (lancer le
   * déploiement).
   *
   * FACULTATIF, et c'est la garantie : absent, tout ce qui LIT le corpus
   * fonctionne exactement comme avant. Seuls les boutons d'écriture et de
   * déploiement se taisent, en le disant.
   */
  GITHUB_TOKEN?: string;

  /**
   * Lecture des analytics Cloudflare — portée « Account Analytics: Read », et
   * rien d'autre. Il ne peut ni écrire, ni déployer, ni lire une donnée
   * applicative.
   *
   * FACULTATIF, comme `GITHUB_TOKEN` et pour la même raison : absent, tout le
   * reste de l'application fonctionne à l'identique et seul l'écran des quotas
   * se tait, en disant ce qui lui manque.
   */
  CLOUDFLARE_ANALYTICS_TOKEN?: string;
  /** L'identifiant du compte Cloudflare — `accountTag` dans l'API GraphQL. */
  CLOUDFLARE_ACCOUNT_ID?: string;
};
