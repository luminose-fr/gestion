export type Env = {
  /** État OAuth de la couche A (codes, jetons d'accès, jetons de rafraîchissement). */
  OAUTH_KV: KVNamespace;

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
   * Signe les identifiants de client (enregistrement dynamique) et le cookie
   * de connexion. `openssl rand -base64 32`. Le changer invalide les clients
   * enregistrés : Claude se réenregistre, rien d'autre ne casse.
   */
  OAUTH_SIGNING_KEY?: string;
};
