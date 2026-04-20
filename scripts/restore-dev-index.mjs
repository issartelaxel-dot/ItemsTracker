import { cpSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const devIndex = resolve(root, 'index.dev.html')
const rootIndex = resolve(root, 'index.html')

if (!existsSync(devIndex)) {
  console.log('index.dev.html not found. Skipping restore.')
  process.exit(0)
}

cpSync(devIndex, rootIndex)
console.log('Restored dev index.html from index.dev.html')
