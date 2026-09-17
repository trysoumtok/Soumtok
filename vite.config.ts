import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** Tell browsers not to disk-cache dev modules (avoids ERR_CACHE_READ_FAILURE on Windows). */
function devNoCache(): Plugin {
  return {
    name: 'soumtok-dev-no-cache',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        res.setHeader('Pragma', 'no-cache')
        next()
      })
    },
  }
}

export default defineConfig(async ({ command }) => {
  const plugins: Plugin[] = [react(), tailwindcss()]
  if (command === 'serve') {
    plugins.unshift(devNoCache())
    const { soumtokApi } = await import('./server/vite-plugin.ts')
    plugins.push(soumtokApi())
  }
  return {
    plugins,
    server: {
      // Listen on IPv4 + IPv6 — Windows often resolves localhost to ::1 only, which breaks 127.0.0.1 probes from Desktop.
      host: true,
      port: 5173,
      strictPort: true,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
      watch: {
        ignored: ['**/public/logos/**', '**/dist/**', '**/desktop/**'],
      },
    },
  }
})
