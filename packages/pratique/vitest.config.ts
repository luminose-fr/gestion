import { defineConfig } from 'vitest/config'

// Zéro dépendance runtime, comme `editorial` (SPEC §14.3). Si un jour ces tests
// avaient besoin d'un environnement de navigateur ou d'une base, c'est que le
// paquet aurait dérivé.
export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
})
