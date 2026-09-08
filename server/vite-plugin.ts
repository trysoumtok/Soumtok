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
        if (!req.url?.startsWith('/api/')) {
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
