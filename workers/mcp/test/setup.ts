/**
 * Le drapeau `global_fetch_strictly_public` de wrangler.toml, tel que workerd
 * l'expose. Sans lui, la bibliothèque n'annonce pas CIMD et refuse de résoudre
 * un client par son document : les tests ne verraient pas le serveur déployé.
 */
(globalThis as { Cloudflare?: unknown }).Cloudflare = {
  compatibilityFlags: { global_fetch_strictly_public: true },
};

/**
 * Aucun appel réseau réel dans les tests : un `fetch` oublié doit échouer
 * bruyamment, pas aller chercher claude.ai (ce qui est arrivé le 01/10/2026 —
 * le test passait, mais dépendait du réseau de la machine qui le jouait).
 * `vi.stubGlobal('fetch', …)` le remplace le temps d'un test ; `unstubAllGlobals`
 * revient à celui-ci.
 */
globalThis.fetch = async (entree: RequestInfo | URL) => {
  throw new Error(`Appel réseau réel interdit dans les tests : ${String(entree instanceof Request ? entree.url : entree)}`);
};
