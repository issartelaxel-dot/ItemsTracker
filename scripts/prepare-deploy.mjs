import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { archiveDeploy } from './archive-deploy.mjs'
import { prepareMailRelay } from './prepare-mail-relay.mjs'

const root = process.cwd()
const distDir = resolve(root, 'dist')
const outDir = resolve(root, 'deploy')

if (!existsSync(distDir)) {
  console.error('Missing dist/. Run "npm run build" first.')
  process.exit(1)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

cpSync(distDir, outDir, { recursive: true })

prepareMailRelay(outDir)
archiveDeploy(outDir)
console.log('Deploy package ready in ./deploy')
console.log('Upload only the CONTENTS of ./deploy to /itemstracker/')
