import { defineConfig } from 'vite'

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === 'true' ? '/interspace-x/' : '/',
  server: {
    port: 5173,
    open: true
  },
  build: {
    target: 'esnext',
    minify: false
  }
})
