import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appVersion = process.env.VITE_APP_VERSION || process.env.APP_VERSION || process.env.RENDER_GIT_COMMIT || 'dev'

function cacheBustBuiltIndex() {
  return {
    name: 'cache-bust-built-index',
    closeBundle() {
      const indexPath = resolve(process.cwd(), 'dist/index.html')
      if (!existsSync(indexPath)) {
        return
      }
      const cacheVersion = encodeURIComponent(appVersion)
      const html = readFileSync(indexPath, 'utf8')
      const nextHtml = html.replace(
        /(assets\/main\.(?:js|css))(?:\?v=[^"']*)?/g,
        `$1?v=${cacheVersion}`,
      )
      writeFileSync(indexPath, nextHtml, 'utf8')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/ItemsTracker/',
  plugins: [react(), cacheBustBuiltIndex()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/main.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'assets/main.css'
          }
          return 'assets/[name][extname]'
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
