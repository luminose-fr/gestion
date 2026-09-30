import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Même choix que workers/api : environnement node, `worker.fetch()` appelé
// directement, `fetch` global simulé. Le seul binding, OAUTH_KV, est remplacé
// par une Map (test/aides.ts).
//
// @cloudflare/workers-oauth-provider importe `cloudflare:workers`, qui
// n'existe que dans workerd : on le remplace par un substitut, et on fait
// passer la bibliothèque par Vite pour que l'alias s'applique à elle aussi.
export default defineConfig({
  resolve: {
    alias: { 'cloudflare:workers': fileURLToPath(new URL('./test/cloudflare-workers.ts', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    restoreMocks: true,
    server: { deps: { inline: ['@cloudflare/workers-oauth-provider'] } },
  },
})
