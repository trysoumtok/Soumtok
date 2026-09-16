import { getRequestListener } from '@hono/node-server'
import type { Plugin } from 'vite'
import { app, ensureMigrated } from './app.ts'

export function soumtokApi(): Plugin {
  return {
    name: 'soumtok-api',
    configureServer(server) {
      const listener = getRequestListener(app.fetch)
      let ready: Promise<void> | null = null

      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0] || ''
        if (
          !path.startsWith('/api/') &&
          path !== '/sitemap.xml' &&
          path !== '/sitemap_index.xml' &&
          path !== '/docs/sitemap.xml' &&
          path !== '/robots.txt' &&
          path !== '/llms.txt'
        ) {
          next()
          return
        }

        ready ??= ensureMigrated().catch((error) => {
          console.warn(
            'Soumtok auth is waiting on Neon:',
            error instanceof Error ? error.message : error,
          )
        })
        await ready
        listener(req, res)
      })
    },
  }
}
