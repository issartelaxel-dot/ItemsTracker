import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
export default defineConfig({
  base: '/',
  plugins: [react()],
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('') },
  build: { outDir: '.test-preview-dist', emptyOutDir: true, rollupOptions: { input: resolve('ops/test-preview/index.html') } },
})
