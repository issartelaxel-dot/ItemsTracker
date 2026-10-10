import { createHash } from 'node:crypto'
import { cpSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnv } from 'vite'

// Keep the React bundle intact; give the sales page its own asset namespace.
const root = process.cwd()
const dist = resolve(root, 'dist')
const marketing = resolve(root, 'marketing')
const presentation = resolve(dist, 'presentation')
const rawBase = process.env.VITE_BASE_PATH || loadEnv('production', root, 'VITE_').VITE_BASE_PATH || '/itemstracker/'
if (!rawBase.startsWith('/') || rawBase.startsWith('//') || /[?#"'`\s]/.test(rawBase)) {
  throw new Error('VITE_BASE_PATH must be an absolute URL path, e.g. /itemstracker/ or /.')
}
const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`
if (!existsSync(resolve(marketing, 'index.html'))) throw new Error('Missing marketing/index.html')
renameSync(resolve(dist, 'index.html'), resolve(dist, 'app.html'))
// Fixed asset filenames need a content key, including in the dist/deploy exports.
const appPath = resolve(dist, 'app.html')
const transitionVersion = extension => createHash('sha256')
  .update(readFileSync(resolve(marketing, `page-transition.${extension}`)))
  .digest('hex').slice(0, 16)
const transitionStyles = `${base}presentation/page-transition.css?v=${transitionVersion('css')}`
const transitionScript = `${base}presentation/page-transition.js?v=${transitionVersion('js')}`
const appHtml = readFileSync(appPath, 'utf8').replace(/assets\/main\.(js|css)(?:\?v=[^"']*)?/g, (_, extension) => {
  const hash = createHash('sha256').update(readFileSync(resolve(dist, `assets/main.${extension}`))).digest('hex').slice(0, 16)
  return `assets/main.${extension}?v=${hash}`
})
  .replace('<script type="module"', '<script blocking="render" type="module"')
  .replace('</head>', `  <link rel="stylesheet" href="${transitionStyles}">\n    <script src="${transitionScript}"></script>\n  </head>`)
writeFileSync(appPath, appHtml)

cpSync(marketing, presentation, { recursive: true })

const appUrl = `${base}app.html`
let html = readFileSync(resolve(marketing, 'index.html'), 'utf8')
  .replaceAll('https://setup-hub.com/itemstracker', appUrl)
  .replace(/\b(src|href|poster)="([^"]+)"/g, (attribute, name, value) => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(value)) return attribute
    return `${name}="${base}presentation/${value}"`
  })
html = html.replaceAll(`href="${appUrl}" target="_blank" rel="noopener"`, `href="${appUrl}"`)
html = html.replace(`${base}presentation/page-transition.css"`, `${transitionStyles}"`)
  .replace(`${base}presentation/page-transition.js"`, `${transitionScript}"`)
// A new HTML export must load its matching presentation styles and scripts.
html = html.replace(/\b(src|href)="([^"]+)"/g, (attribute, name, value) => {
  const prefix = `${base}presentation/`
  if (!value.startsWith(prefix) || value.includes('?') || value.includes('#')) return attribute
  const asset = value.slice(prefix.length)
  if (!/^[\w.-]+\.(css|js)$/.test(asset)) return attribute
  const hash = createHash('sha256').update(readFileSync(resolve(marketing, asset))).digest('hex').slice(0, 16)
  return `${name}="${value}?v=${hash}"`
})
writeFileSync(resolve(dist, 'index.html'), html)
// There is only one public landing entrypoint; CSS/assets remain relative here.
rmSync(resolve(presentation, 'index.html'))
for (const file of readdirSync(presentation)) {
  if (!file.endsWith('.js')) continue
  const path = resolve(presentation, file)
  writeFileSync(path, readFileSync(path, 'utf8').replace(/(["'`])assets\//g, `$1${base}presentation/assets/`))
}
console.log(`Sales page: ${base} — Application: ${appUrl}`)
