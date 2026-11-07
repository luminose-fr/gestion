import { defineConfig, type ProxyOptions } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { origineVueParLeWorker } from './proxy-dev'

const cible = process.env.VITE_API_TARGET ?? 'http://localhost:8787'

// `changeOrigin` réécrit Host, pas Origin : sans la traduction ci-dessous, le
// Worker voit une écriture venue de :7860 sur :8787 et la refuse (403
// « Origine refusée »). Le pourquoi — et pourquoi pas côté Worker — est dans
// proxy-dev.ts.
const versLeWorker: ProxyOptions = {
  target: cible,
  changeOrigin: true,
  configure: (proxy) => {
    proxy.on('proxyReq', (proxyReq, req) => {
      const origine = origineVueParLeWorker(req.headers.origin, req.headers.host, cible)
      if (origine) proxyReq.setHeader('origin', origine)
    })
  },
}

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
      '^/api/': versLeWorker,
      '^/auth/': versLeWorker,
    },
  },
  preview: {
    host: true,
    port: 7860,
    allowedHosts: true
  }
})
