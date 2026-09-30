/**
 * Le drapeau `global_fetch_strictly_public` de wrangler.toml, tel que workerd
 * l'expose. Sans lui, la bibliothèque n'annonce pas CIMD et refuse de résoudre
 * un client par son document : les tests ne verraient pas le serveur déployé.
 */
(globalThis as { Cloudflare?: unknown }).Cloudflare = {
  compatibilityFlags: { global_fetch_strictly_public: true },
};
