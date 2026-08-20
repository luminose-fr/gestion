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
    port: 7860,
    // Reproduit l'origine unique de la production (SPEC §1.2) : en local aussi,
    // le front appelle /api/* en relatif, et c'est le proxy qui atteint
    // `wrangler dev`. Un seul chemin de code, dev et prod confondus.
    //
    // Les motifs sont ANCRÉS et terminés par un slash. Sans le `^…/`, la clé
    // `/auth` capturait aussi `/auth.ts` — le module du front — qui partait
    // vers le Worker et revenait en 404 : page blanche, root vide, aucune
    // erreur parlante dans la console.
    proxy: {
      '^/api/': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:8787',
        changeOrigin: true,
      },
      '^/auth/': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    port: 7860,
    allowedHosts: true
  }
})
