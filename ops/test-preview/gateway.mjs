import crypto from 'node:crypto'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import jwt from 'jsonwebtoken'

export function createPreviewGateway(env = process.env) {
  const { PREVIEW_ACCESS_HASH, PREVIEW_SESSION_SECRET, PREVIEW_HOST, BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD } = env
  if (!/^[a-f0-9]{64}$/.test(PREVIEW_ACCESS_HASH || '') || (PREVIEW_SESSION_SECRET || '').length < 32 || !PREVIEW_HOST || !BOOTSTRAP_EMAIL || !BOOTSTRAP_PASSWORD) throw Error('Missing preview-only configuration')
  const accounts = [
    { accessHash: PREVIEW_ACCESS_HASH, email: BOOTSTRAP_EMAIL, password: BOOTSTRAP_PASSWORD },
    ...JSON.parse(env.PREVIEW_EXTRA_ACCOUNTS || '[]'),
  ]
  const hashes = new Set(), emails = new Set()
  for (const account of accounts) {
    if (!/^[a-f0-9]{64}$/.test(account.accessHash || '') || typeof account.email !== 'string' || !account.email.includes('@') || typeof account.password !== 'string' || !account.password || hashes.has(account.accessHash) || emails.has(account.email.toLowerCase())) throw Error('Invalid preview account configuration')
    hashes.add(account.accessHash); emails.add(account.email.toLowerCase())
  }
  const origin = env.PREVIEW_ORIGIN || `https://${PREVIEW_HOST}`
  const api = new URL(env.PREVIEW_INTERNAL_API || 'http://127.0.0.1:8787')
  if (!['127.0.0.1', 'localhost'].includes(api.hostname)) throw Error('Preview API must be loopback')
  const secure = new URL(origin).protocol === 'https:'
  const cookie = secure ? '__Host-itemstracker_preview' : 'itemstracker_preview_local'
  const options = { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: 7 * 86400000 }
  const app = express()
  app.disable('x-powered-by'); app.set('trust proxy', 1)
  app.use(cookieParser())
  app.use((_req, res, next) => {
    res.set({ 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' })
    next()
  })
  const gate = (message = '') => `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>ItemsTracker — Accès test</title><style>*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:radial-gradient(ellipse at top,#dceaff,#f7faff 65%);font:15px/1.5 system-ui;color:#172b4a;padding:24px}.card{width:min(100%,430px);padding:36px;border:1px solid #d4e3f9;background:#ffffffed;border-radius:24px;box-shadow:0 20px 80px #16417c14}.mark{display:grid;place-items:center;width:48px;height:48px;background:#086bfa;border-radius:14px;color:white;font-weight:750;font-size:20px}.tag{font-size:11px;letter-spacing:1px;color:#2178f6;margin-top:22px;font-weight:700}h1{font-size:27px;line-height:1.2;margin:10px 0 14px}p,small{color:#63779b}label{display:block;font-weight:600;font-size:13px;margin-top:24px}input,button{width:100%;min-height:48px;border-radius:11px;font:inherit;margin-top:8px;padding:12px}input{border:1px solid #bed4f4;background:#f8fbff}input:focus{outline:2px solid #86b6ff;outline-offset:2px}button{border:0;background:#086bfa;color:white;margin-top:16px;cursor:pointer;font-weight:600}small{display:block;font-size:12px;margin-top:20px}.error{color:#b9233d;background:#fff1f3;padding:10px;border-radius:8px;font-size:13px}</style></head><body><main class="card"><div class="mark">IT</div><div class="tag">VERSION DE TEST PRIVÉE</div><h1>Découvre le nouvel ItemsTracker</h1><p>Saisis le code reçu pour ouvrir ton espace de test.</p>${message ? `<p class="error" role="alert">${message}</p>` : ''}<form action="/_preview/access" method="post"><label for="code">Ton code d’accès</label><input id="code" name="code" type="password" required autocomplete="off" spellcheck="false" autofocus placeholder="Code d’accès privé"><button type="submit">Accéder à la version de test</button></form><small>Un environnement indépendant. Les modifications faites ici restent dans la version de test.</small></main></body></html>`
  app.get('/robots.txt', (_req, res) => res.type('text').send('User-agent: *\nDisallow: /\n'))
  app.get('/_preview/access', (_req, res) => res.type('html').send(gate()))
  const attempts = rateLimit({ windowMs: 15 * 60000, limit: 10, standardHeaders: true, legacyHeaders: false, handler: (_req, res) => res.status(429).type('html').send(gate('Trop de tentatives. Réessaie dans quinze minutes.')) })
  app.post('/_preview/access', attempts, express.urlencoded({ extended: false, limit: '2kb' }), async (req, res) => {
    if (req.get('origin') !== origin) return res.sendStatus(403)
    const given = crypto.createHash('sha256').update(String(req.body.code || '').trim()).digest()
    let account
    for (const candidate of accounts) if (crypto.timingSafeEqual(given, Buffer.from(candidate.accessHash, 'hex'))) account = candidate
    if (!account) return res.status(401).type('html').send(gate('Ce code n’est pas valide. Vérifie le code reçu.'))
    try {
      const login = await fetch(new URL('/api/auth/login', api), { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-version': '0.1.1' }, body: JSON.stringify({ email: account.email, password: account.password }), signal: AbortSignal.timeout(10000) })
      if (!login.ok) throw Error('Preview login unavailable')
      for (const value of login.headers.getSetCookie()) res.append('Set-Cookie', value)
      res.cookie(cookie, jwt.sign({ preview: true }, PREVIEW_SESSION_SECRET, { expiresIn: '7d', audience: 'itemstracker-test' }), options)
      res.redirect(303, '/')
    } catch { res.status(503).type('html').send(gate('L’espace de test démarre. Réessaie dans un instant.')) }
  })
  const proxy = (req, res) => {
    const headers = { ...req.headers, host: PREVIEW_HOST, 'x-forwarded-proto': secure ? 'https' : 'http' }
    delete headers.connection
    const upstream = http.request({ hostname: api.hostname, port: api.port || 80, path: req.originalUrl, method: req.method, headers }, response => {
      res.status(response.statusCode || 502)
      for (const [name, value] of Object.entries(response.headers)) if (value !== undefined && !['connection', 'transfer-encoding'].includes(name)) res.setHeader(name, value)
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
      response.pipe(res)
    })
    upstream.setTimeout(35000, () => upstream.destroy())
    upstream.on('error', () => { if (!res.headersSent) res.status(502).json({ error: 'L’espace de test est temporairement indisponible.' }); else res.end() })
    req.on('aborted', () => upstream.destroy()); req.pipe(upstream)
  }
  // Native Apple clients authenticate with their dedicated CalDAV credentials.
  app.use((req, res, next) => req.path === '/.well-known/caldav' || req.path === '/dav' || req.path.startsWith('/dav/') ? proxy(req, res) : next())
  app.use((req, res, next) => {
    try { const session = jwt.verify(req.cookies[cookie] || '', PREVIEW_SESSION_SECRET, { audience: 'itemstracker-test' }); if (!session.preview) throw Error(); next() }
    catch { if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Saisis ton code d’accès de test.' }); res.redirect(303, '/_preview/access') }
  })
  app.get('/preview-session.js', (_req, res) => res.type('js').send(`const originalFetch=window.fetch.bind(window);window.fetch=async(...args)=>{const response=await originalFetch(...args);const input=args[0];const url=new URL(typeof input==='string'?input:input instanceof Request?input.url:String(input),location.href);if(url.origin===location.origin&&((url.pathname==='/api/auth/me'&&response.status===401)||url.pathname==='/api/auth/logout'))location.replace('/_preview/access');return response};`))
  app.use((req, res, next) => {
    if (req.path === '/api/auth/logout') { res.clearCookie(cookie, options); return proxy(req, res) }
    if ((req.path.startsWith('/api/auth/') && req.path !== '/api/auth/me') || req.path.startsWith('/api/register') || req.path.startsWith('/api/registration') || req.path === '/api/quiz/generate-mcq' || req.path.startsWith('/api/admin/') || req.path.startsWith('/api/onboarding/admin/')) return res.status(403).json({ error: 'Cette action est désactivée dans la version de test.' })
    if (req.path.startsWith('/api/')) return proxy(req, res)
    next()
  })
  const web = path.resolve(env.PREVIEW_WEB_DIR || 'web')
  app.use(express.static(web, { index: false, dotfiles: 'deny' }))
  app.get(['/', '/app.html'], (_req, res) => res.sendFile(path.join(web, 'ops/test-preview/index.html'), { dotfiles: 'allow' }))
  app.use((_req, res) => res.sendStatus(404))
  return app
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createPreviewGateway().listen(8080, '0.0.0.0', () => console.log('Isolated test gateway listening on port 8080'))
}
