import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

export type Env = {
  /**
   * État OAuth de la couche A, tenu par @cloudflare/workers-oauth-provider :
   * grants, codes, jetons (par empreinte), clients préenregistrés.
   */
  OAUTH_KV: KVNamespace;

  /** Posé par la bibliothèque pour le gestionnaire de /authorize et /callback. */
  OAUTH_PROVIDER: OAuthHelpers;

  /**
   * Couche A — la seule adresse admise. Posée dans [vars] de wrangler.toml.
   * Absente, PERSONNE ne se connecte : la liste d'autorisation échoue fermée.
   */
  ALLOWED_EMAIL?: string;

  /**
   * Client OAuth Google (type « Application Web »), commun aux deux couches :
   * il identifie Florent pour la couche A et renouvelle l'accès Ads pour la
   * couche B. Un seul client à tenir, deux URL de retour déclarées.
   */
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;

  /**
   * Couche B — obtenu une fois par scripts/jeton-google-ads.mjs, scope
   * `adwords`. Écran de consentement « Interne » : il n'expire pas au bout
   * de sept jours comme le ferait un client « Externe » en test.
   */
  GOOGLE_ADS_REFRESH_TOKEN?: string;
  /** Le compte Luminose, dix chiffres. C'est le compte interrogé par défaut. */
  GOOGLE_ADS_CUSTOMER_ID?: string;
  /** Seulement si l'accès au compte passe par un compte administrateur (MCC). */
  GOOGLE_ADS_LOGIN_CUSTOMER_ID?: string;

  /**
   * Signe le cookie qui porte la demande d'autorisation pendant l'aller-retour
   * chez Google. `openssl rand -base64 32`. Le changer n'invalide que les
   * connexions en cours depuis moins de dix minutes.
   */
  COOKIE_SIGNING_KEY?: string;

  // ── Écriture (cadrage du 01/10/2026) ──────────────────────────────────

  /**
   * La base `luminose-mcp`, à part de celle de la console : le journal des
   * écritures (V7) et ce qui compte le plafond de volume (V9).
   */
  DB: D1Database;

  /**
   * Signe les jetons d'aperçu (V2), pour Google Ads comme pour le corpus.
   * Absent, l'écriture est fermée et la lecture continue. `openssl rand -base64 32`.
   */
  ADS_APERCU_KEY?: string;

  /**
   * V9 — exécutions permises sur 24 heures glissantes. [vars] de wrangler.toml :
   * le changer ne demande pas de toucher au code. Absent ou illisible,
   * l'écriture est fermée.
   */
  ADS_ECRITURES_MAX_JOUR?: string;

  // ── Créer (cadrage du 02/10/2026) — [vars] de wrangler.toml, en euros ──

  /** R3 — budget quotidien maximal d'une campagne créée. */
  ADS_BUDGET_MAX_JOUR?: string;
  /** R3 — engagement maximal : campagnes actives + campagnes « [Claude] » en pause. */
  ADS_BUDGET_MAX_TOTAL?: string;
  /** R3 — plafond de CPC d'une campagne Search en « Maximiser les clics ». */
  ADS_CPC_MAX?: string;
  /** R4 — la campagne Search dont le ciblage est recopié. */
  ADS_CAMPAGNE_MODELE?: string;

  // ── Demand Gen (cadrage du 07/10/2026) — [vars] de wrangler.toml ──────

  /** DG1 — budget total maximal d'une campagne Demand Gen, en euros. Absent ou illisible, Demand Gen est fermé. */
  ADS_BUDGET_MAX_CAMPAGNE?: string;
  /**
   * DG3 — les objectifs de conversion permis, `clé:id,clé:id` : des objectifs
   * personnalisés (`custom_conversion_goal.id`) que Florent a créés dans
   * Google Ads. Vide, la création de campagne Demand Gen est fermée.
   */
  ADS_OBJECTIFS_CONVERSION?: string;
  /**
   * DG4 — les lieux du préréglage `locale` : des `geoTargetConstants`,
   * séparés par des virgules. Vide, ce préréglage est fermé ;
   * `france_metropolitaine` reste ouvert.
   */
  ADS_ZONE_LOCALE?: string;

  // ── Le corpus (décision du 03/10/2026) ────────────────────────────────

  /**
   * Couche C — un jeton GitHub à grain fin, limité au dépôt luminose-fr/gestion,
   * droits Contents et Actions en lecture-écriture. Le sien : pas celui de la
   * console (SPEC §1.1). Absent, les outils du corpus le disent et Google Ads
   * continue.
   */
  GITHUB_TOKEN?: string;

  /**
   * V9 pour le corpus — commits et déploiements permis sur 24 heures
   * glissantes. Son plafond à lui : une série de corrections n'épuise pas
   * celui de Google Ads. Absent ou illisible, l'écriture du corpus est fermée.
   */
  CORPUS_ECRITURES_MAX_JOUR?: string;
};
