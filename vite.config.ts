import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(async ({ command }) => {
  const plugins = [react(), tailwindcss()]
  if (command === 'serve') {
    const { soumtokApi } = await import('./server/vite-plugin.ts')
    plugins.push(soumtokApi())
  }
  return {
    plugins,
    server: {
      watch: {
        ignored: ['**/public/logos/**'],
      },
    },
  }
})
