import { defineConfig } from 'vitest/config'

// Le Worker tourne en environnement node : ses tests appellent `worker.fetch()`
// directement, avec un `fetch` global stubé (SPEC §10.2). Pas besoin du pool
// Workers tant qu'aucun binding (D1, R2) n'est sollicité — quand D1 entrera en
// jeu (phase 3), ce sera le moment de reconsidérer.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    restoreMocks: true,
  },
})
