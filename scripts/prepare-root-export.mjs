import { cpSync, existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const distDir = resolve(root, 'dist')
const devIndex = resolve(root, 'index.dev.html')
const rootIndex = resolve(root, 'index.html')

if (!existsSync(devIndex)) {
  cpSync(rootIndex, devIndex)
  console.log('Saved dev template: index.dev.html')
}

if (!existsSync(distDir)) {
  console.error('Missing dist/. Run build first.')
  process.exit(1)
}

cpSync(resolve(distDir, 'index.html'), rootIndex)

rmSync(resolve(root, 'assets'), { recursive: true, force: true })
cpSync(resolve(distDir, 'assets'), resolve(root, 'assets'), { recursive: true })

for (const file of ['favicon.svg', 'icons.svg']) {
  const src = resolve(distDir, file)
  if (existsSync(src)) {
    cpSync(src, resolve(root, file))
  }
}

console.log('Root export prepared: index.html + /assets now point to production bundle.')
console.log('You can zip the whole project folder and upload it as-is.')
