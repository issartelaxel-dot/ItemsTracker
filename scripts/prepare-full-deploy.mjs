import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { archiveDeploy } from './archive-deploy.mjs'

const root = process.cwd()
const outDir = resolve(root, 'deploy-full')
const includedTopLevel = ['index.html', 'app.html', 'presentation', 'assets', 'favicon.svg', 'icons.svg', '.htaccess']

if (['index.html', 'app.html', 'assets/main.js', 'presentation/styles.css'].some(entry => !existsSync(resolve(root, entry)))) {
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

archiveDeploy(outDir)
cpSync(resolve(outDir, 'Archive.zip'), resolve(root, 'deploy-full.zip'))
console.log('Full deploy package ready in ./deploy-full')
console.log('Upload-ready archive also available as ./deploy-full.zip')
console.log('Upload the CONTENTS of ./deploy-full to /itemstracker/')
