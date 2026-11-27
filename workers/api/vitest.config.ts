import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Le Worker tourne en environnement node : ses tests appellent `worker.fetch()`
// directement, avec un `fetch` global stubé (SPEC §10.2). Pas besoin du pool
// Workers tant qu'aucun binding (D1, R2) n'est sollicité — quand D1 entrera en
// jeu (phase 3), ce sera le moment de reconsidérer.
//
// Les entrées nommées (SPEC §14.3) héritent de `WorkerEntrypoint`, importé de
// `cloudflare:workers` — un module que seul workerd fournit. Sous Node, un
// alias le remplace par une classe minimale (test/cloudflare-workers.ts), comme
// dans workers/mcp. Le Worker construit, lui, reçoit le vrai.
export default defineConfig({
  resolve: {
    alias: { 'cloudflare:workers': fileURLToPath(new URL('./test/cloudflare-workers.ts', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    restoreMocks: true,
  },
})
