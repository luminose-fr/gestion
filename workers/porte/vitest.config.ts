import { defineConfig } from 'vitest/config'

// Même choix que workers/api et workers/mcp : environnement node, `fetch()` du
// Worker appelé directement, liaisons simulées. Aucun appel réseau.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    restoreMocks: true,
  },
})
