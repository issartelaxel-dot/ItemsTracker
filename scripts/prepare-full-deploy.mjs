import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const outDir = resolve(root, 'deploy-full')
const includedTopLevel = ['index.html', 'assets', 'favicon.svg', 'icons.svg', '.htaccess']

if (!existsSync(resolve(root, 'assets', 'main.js')) || !existsSync(resolve(root, 'index.html'))) {
  console.error('Missing production root export. Run "npm run export:ready" first.')
  process.exit(1)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

for (const entryName of includedTopLevel) {
  const src = resolve(root, entryName)
  if (!existsSync(src)) {
    continue
  }
  const dst = resolve(outDir, entryName)
  cpSync(src, dst, { recursive: true })
}

console.log('Full deploy package ready in ./deploy-full')
console.log('Upload the CONTENTS of ./deploy-full to /ItemsTracker/')
