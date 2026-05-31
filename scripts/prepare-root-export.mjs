import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

const cacheVersion = Date.now().toString()
const rootIndexContent = readFileSync(rootIndex, 'utf8')
const cacheBustedRootIndex = rootIndexContent
  .replace(/assets\/main\.js(\?v=\d+)?/g, `assets/main.js?v=${cacheVersion}`)
  .replace(/assets\/main\.css(\?v=\d+)?/g, `assets/main.css?v=${cacheVersion}`)
writeFileSync(rootIndex, cacheBustedRootIndex, 'utf8')

rmSync(resolve(root, 'assets'), { recursive: true, force: true })
cpSync(resolve(distDir, 'assets'), resolve(root, 'assets'), { recursive: true })

const publicDir = resolve(root, 'public')
for (const file of ['favicon.svg', 'icons.svg']) {
  const src = resolve(publicDir, file)
  if (existsSync(src)) {
    cpSync(src, resolve(root, file))
  }
}

console.log(`Root export prepared: index.html + /assets now point to production bundle (v=${cacheVersion}).`)
console.log('You can zip the whole project folder and upload it as-is.')
