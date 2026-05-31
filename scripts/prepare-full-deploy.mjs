import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const outDir = resolve(root, 'deploy-full')

const excludedTopLevel = new Set([
  '.git',
  'node_modules',
  'dist',
  'deploy',
  'deploy-full',
  '.DS_Store',
])

if (!existsSync(resolve(root, 'assets', 'main.js')) || !existsSync(resolve(root, 'index.html'))) {
  console.error('Missing production root export. Run "npm run export:ready" first.')
  process.exit(1)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const topEntries = readdirSync(root, { withFileTypes: true })
for (const entry of topEntries) {
  if (excludedTopLevel.has(entry.name)) {
    continue
  }
  const src = resolve(root, entry.name)
  const dst = resolve(outDir, entry.name)
  cpSync(src, dst, { recursive: true })
}

console.log('Full deploy package ready in ./deploy-full')
console.log('Upload the CONTENTS of ./deploy-full to /ItemsTracker/')
