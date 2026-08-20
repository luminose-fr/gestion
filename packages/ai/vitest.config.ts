import { defineConfig } from 'vitest/config'

// Zéro dépendance runtime : ni jsdom, ni plugin React. Si un jour ces tests
// avaient besoin de l'un ou de l'autre, c'est que le package aurait dérivé.
export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
})
