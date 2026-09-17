import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  server: { port: 5173, host: true },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        about: resolve(__dirname, 'about.html'),
        menu: resolve(__dirname, 'menu.html'),
        contact: resolve(__dirname, 'contact.html'),
      },
    },
  },
})
