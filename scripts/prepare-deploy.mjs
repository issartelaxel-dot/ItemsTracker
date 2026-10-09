import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { archiveDeploy } from './archive-deploy.mjs'

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

archiveDeploy(outDir)
console.log('Deploy package ready in ./deploy')
console.log('Upload only the CONTENTS of ./deploy to /itemstracker/')
