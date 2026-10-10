import { createHash } from 'node:crypto'
import { cpSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnv, transformWithEsbuild } from 'vite'

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
const contentKey = content => createHash('sha256').update(content).digest('hex').slice(0, 16)
cpSync(marketing, presentation, { recursive: true })
// The proxy must route these domain-root paths to this static frontend.
for (const file of ['robots.txt', 'llms.txt']) {
  cpSync(resolve(root, 'ops/frontend/public-root', file), resolve(dist, file))
}

// Fingerprint media and fonts so long-lived caching cannot serve an old release.
const media = new Map()
function fingerprint(directory, prefix = 'assets') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const source = resolve(directory, entry.name)
    const relative = `${prefix}/${entry.name}`
    if (entry.isDirectory()) { fingerprint(source, relative); continue }
    if (!/\.(png|jpe?g|webp|svg|woff2)$/.test(entry.name)) continue
    const hashed = relative.replace(/(\.[^.]+)$/, `.${contentKey(readFileSync(source))}$1`)
    renameSync(source, resolve(presentation, hashed))
    media.set(relative, `${base}presentation/${hashed}`)
  }
}
fingerprint(resolve(presentation, 'assets'))
function rewriteMedia(content) {
  for (const [source, destination] of media) content = content.replaceAll(source, destination)
  return content
}
// Keep individual files usable too (notably transition CSS on the React page).
for (const file of readdirSync(presentation)) {
  if (!/\.(css|js)$/.test(file)) continue
  const path = resolve(presentation, file)
  writeFileSync(path, rewriteMedia(readFileSync(path, 'utf8'))
    .replace(/(["'`])assets\//g, `$1${base}presentation/assets/`))
}
const sourceHtml = readFileSync(resolve(marketing, 'index.html'), 'utf8')
const styleFiles = [...sourceHtml.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(match => match[1])
const scriptFiles = [...sourceHtml.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map(match => match[1])
const css = (await transformWithEsbuild(styleFiles.map(file => readFileSync(resolve(presentation, file), 'utf8')).join('\n'), 'landing.css', {
  loader: 'css', minify: true, target: ['chrome109', 'safari16.4'], sourcemap: false,
})).code
const js = (await transformWithEsbuild(`(() => {\n${scriptFiles.map(file => readFileSync(resolve(presentation, file), 'utf8')).join('\n;\n')}\n})();`, 'landing.js', {
  minify: true, target: 'es2020', sourcemap: false,
})).code
const stylesheet = `landing.${contentKey(css)}.css`
const javascript = `landing.${contentKey(js)}.js`
writeFileSync(resolve(presentation, stylesheet), css)
writeFileSync(resolve(presentation, javascript), js)

// These tiny bootstraps must execute before paint to preserve the selected hero
// and the landing/app transition, without a blocking network request.
const transitionBootstrap = (await transformWithEsbuild(readFileSync(resolve(marketing, 'page-transition.js'), 'utf8'), 'page-transition.js', {
  minify: true, target: 'es2020', sourcemap: false,
})).code.replaceAll('</script', '<\\/script')
const heroBootstrap = (await transformWithEsbuild(readFileSync(resolve(marketing, 'hero-designs.js'), 'utf8'), 'hero-designs.js', {
  minify: true, target: 'es2020', sourcemap: false,
})).code
const inlineTransition = `<script data-base="${base}">${transitionBootstrap}</script>`
renameSync(resolve(dist, 'index.html'), resolve(dist, 'app.html'))
// Fixed asset filenames need a content key, including in the dist/deploy exports.
const appPath = resolve(dist, 'app.html')
const transitionVersion = extension => createHash('sha256')
  .update(readFileSync(resolve(presentation, `page-transition.${extension}`)))
  .digest('hex').slice(0, 16)
const transitionCss = `page-transition.${transitionVersion('css')}.css`
cpSync(resolve(presentation, 'page-transition.css'), resolve(presentation, transitionCss))
const transitionStyles = `${base}presentation/${transitionCss}`
const appHtml = readFileSync(appPath, 'utf8').replace(/assets\/main\.(js|css)(?:\?v=[^"']*)?/g, (_, extension) => {
  const hash = createHash('sha256').update(readFileSync(resolve(dist, `assets/main.${extension}`))).digest('hex').slice(0, 16)
  return `assets/main.${extension}?v=${hash}`
})
  .replace('<script type="module"', '<script blocking="render" type="module"')
  .replace('</head>', `  <link rel="stylesheet" href="${transitionStyles}">\n    ${inlineTransition}\n  </head>`)
writeFileSync(appPath, appHtml)

const appUrl = `${base}app.html`
let firstStyle = true, firstScript = true
let html = rewriteMedia(sourceHtml)
  .replace(/<link rel="stylesheet" href="([^"]+)">/g, () => {
    if (!firstStyle) return ''
    firstStyle = false
    return `<link rel="stylesheet" href="${base}presentation/${stylesheet}">`
  })
  .replace(/<script src="([^"]+)" defer><\/script>/g, () => {
    if (!firstScript) return ''
    firstScript = false
    return `<script src="${base}presentation/${javascript}" defer></script>`
  })
  .replace('<script src="page-transition.js"></script>', inlineTransition)
  .replace('<script src="hero-designs.js"></script>', `<script>${heroBootstrap}</script>`)
  .replaceAll('https://setup-hub.com/itemstracker', appUrl)
  .replace(/\b(src|href|poster)="([^"]+)"/g, (attribute, name, value) => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(value)) return attribute
    return `${name}="${base}presentation/${value}"`
  })
html = html.replaceAll(`href="${appUrl}" target="_blank" rel="noopener"`, `href="${appUrl}"`)
// A new HTML export must load its matching presentation styles and scripts.
html = html.replace(/\b(src|href)="([^"]+)"/g, (attribute, name, value) => {
  const prefix = `${base}presentation/`
  if (!value.startsWith(prefix) || value.includes('?') || value.includes('#')) return attribute
  const asset = value.slice(prefix.length)
  if (!/^[\w.-]+\.(css|js)$/.test(asset)) return attribute
  if (/\.[a-f0-9]{16}\./.test(asset)) return attribute
  const hash = createHash('sha256').update(readFileSync(resolve(marketing, asset))).digest('hex').slice(0, 16)
  return `${name}="${value}?v=${hash}"`
})
writeFileSync(resolve(dist, 'index.html'), html.replace(/^[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n'))
// Keep original images in marketing/, but ship only the media referenced by the
// page and all hero variants. Video/captions retain their existing dynamic URLs.
const referencedContent = html + css + js
for (const destination of media.values()) {
  if (!referencedContent.includes(destination)) {
    rmSync(resolve(presentation, destination.slice(`${base}presentation/`.length)))
  }
}
// There is only one public landing entrypoint; CSS/assets remain relative here.
rmSync(resolve(presentation, 'index.html'))
console.log(`Sales page: ${base} — Application: ${appUrl} — 1 CSS + 1 deferred JS, local fonts and fingerprinted media`)
