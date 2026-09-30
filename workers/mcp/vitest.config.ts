import { defineConfig } from 'vitest/config'

// Même choix que workers/api : environnement node, `worker.fetch()` appelé
// directement, `fetch` global simulé. Le seul binding, OAUTH_KV, est remplacé
// par une Map (test/aides.ts) — le pool Workers n'apporterait rien de plus.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    restoreMocks: true,
  },
})
