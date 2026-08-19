import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  base: '/',
  // Un seul .env.local, à la racine du monorepo : le front, les outils de
  // migration et le script de déploiement y lisent les mêmes identifiants.
  // Sans ça, Vite le chercherait dans apps/manager/ et n'y trouverait rien.
  envDir: '../..',
  server: {
    host: true,
    port: 7860
  },
  preview: {
    host: true,
    port: 7860,
    allowedHosts: true
  }
})
