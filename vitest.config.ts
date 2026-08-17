import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Config séparée de vite.config.ts : le build de prod n'a pas besoin de React
// en mode test, et on garde les deux fichiers lisibles.
export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom seulement là où on monte des composants ; les suites pures et le
    // Worker tournent en environnement node (voir le commentaire en tête de
    // chaque fichier via @vitest-environment).
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
