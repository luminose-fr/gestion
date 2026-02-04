import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    base: '/gestion/', 
    server: {
      host: true,
      port: 7860
    },
    preview: {
      host: true,
      port: 7860,
      allowedHosts: true
    }
  }
})