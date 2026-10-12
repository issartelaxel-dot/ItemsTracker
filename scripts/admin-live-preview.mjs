import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, '.admin-live-dist')
const upstream = new URL(process.env.ADMIN_PREVIEW_API_URL || 'https://api.setup-hub.com')
const port = Number(process.env.ADMIN_PREVIEW_PORT || 4174)

if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
  throw new Error('ADMIN_PREVIEW_PORT invalide.')
}
if (upstream.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(upstream.hostname)) {
  throw new Error('L’API distante doit utiliser HTTPS.')
}

const app = express()
app.disable('x-powered-by')
app.use((_req, res, next) => {
  res.set('Cache-Control', 'private, no-store')
  res.set('Referrer-Policy', 'no-referrer')
  res.set('X-Content-Type-Options', 'nosniff')
  next()
})
app.use('/api', express.json({ limit: '8kb' }))

function permitted(method, pathname) {
  if (method === 'GET' && (
    pathname === '/api/admin/analytics' ||
    /^\/api\/admin\/analytics\/entities\/[A-Za-z0-9-]+$/.test(pathname) ||
    pathname === '/api/admin/announcements' ||
    pathname === '/api/auth/me'
  )) return true
  return method === 'POST' && ['/api/auth/login', '/api/auth/logout'].includes(pathname)
}

app.use('/api', async (req, res) => {
  if (!permitted(req.method, '/api' + req.path)) {
    res.status(405).json({ error: 'Aperçu local en lecture seule.' })
    return
  }
  try {
    const target = new URL(req.originalUrl, upstream)
    const headers = { 'X-Client-Version': String(req.get('x-client-version') || '0.1.1') }
    if (req.method === 'POST') headers['Content-Type'] = 'application/json'
    if (req.path !== '/auth/login' && req.get('authorization')) {
      headers.Authorization = req.get('authorization')
    }
    const response = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? JSON.stringify(req.body || {}) : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    })
    res.status(response.status)
    for (const name of ['content-type', 'x-app-version', 'x-min-client-version']) {
      const value = response.headers.get(name)
      if (value) res.set(name, value)
    }
    res.send(Buffer.from(await response.arrayBuffer()))
  } catch {
    res.status(502).json({ error: 'API de production inaccessible. Réessaie dans un instant.' })
  }
})

app.get('/itemstracker/admin-app.html', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>ItemsTracker · Administration</title><link rel="icon" href="/itemstracker/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/itemstracker/assets/main.css"><script type="module" src="/itemstracker/assets/main.js"></script></head>
<body><div id="root"></div></body></html>`)
})
app.use('/itemstracker', express.static(dist, { index: false }))
app.get('/', (_req, res) => res.redirect('/itemstracker/admin-app.html'))

app.listen(port, '127.0.0.1', () => {
  console.log(`Administration réelle en lecture seule : http://localhost:${port}/itemstracker/admin-app.html`)
})
