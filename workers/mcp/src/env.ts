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
};
