import { defineConfig } from 'vitest/config'

// Le contrat /v1 en schémas : zod, et rien d'autre (SPEC §14.3). Ni base, ni
// réseau, ni API Workers — la porte comme gestion l'importent.
export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
})
