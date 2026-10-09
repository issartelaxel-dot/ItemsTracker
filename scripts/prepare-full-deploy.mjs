import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { archiveDeploy } from './archive-deploy.mjs'
import { prepareMailRelay } from './prepare-mail-relay.mjs'

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

prepareMailRelay(outDir)
const localConfig = resolve(root, 'installation-mail-lws/relay-config.local.php')
const hasLocalConfig = existsSync(localConfig)
if (hasLocalConfig) {
  const destination = resolve(outDir, 'email-relay/relay-config.local.php')
  cpSync(localConfig, destination)
  chmodSync(destination, 0o600)
}
archiveDeploy(outDir)
cpSync(resolve(outDir, 'Archive.zip'), resolve(root, 'deploy-full.zip'))
if (hasLocalConfig) {
  chmodSync(resolve(outDir, 'Archive.zip'), 0o600)
  chmodSync(resolve(root, 'deploy-full.zip'), 0o600)
  console.log('Private package: includes your local relay configuration. Do not share this archive.')
}
console.log('Full deploy package ready in ./deploy-full')
console.log('Upload-ready archive also available as ./deploy-full.zip')
console.log('Upload the CONTENTS of ./deploy-full to /itemstracker/')
