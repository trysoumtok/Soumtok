import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** Stop Chrome ERR_CACHE_READ_FAILURE on 304 during dev reloads. */
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
      port: 5173,
      strictPort: true,
      watch: {
        ignored: ['**/public/logos/**', '**/dist/**', '**/desktop/**'],
      },
    },
  }
})
