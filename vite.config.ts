import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { soumtokApi } from './server/vite-plugin.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), soumtokApi()],
  server: {
    watch: {
      ignored: ['**/public/logos/**'],
    },
  },
})
