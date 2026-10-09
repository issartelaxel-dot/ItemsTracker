import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import cors from 'cors'
import { webkit } from '@playwright/test'

// Use actual browser HTTP/CORS requests: Playwright route mocks skip CORS enforcement.
const user = { id: 123, email: 'test@example.test', displayName: 'Test' }
const state = { trackingState: { items: {} }, theme: 'light', focusMode: false, dateFormat: 'fr-short', timeZone: 'auto',
  youtubeDisplayMode: 'embed', shuffleQuizCards: false,
  profile: { firstName: 'Test', lastName: 'Local', email: user.email, photoUrl: '', password: '', avatarGradient: 'red' } }
let base, apiBase, browser, outage = 'none', stateFailures = 0
const requests = []
const corsHandler = cors({ origin: (origin, callback) => callback(null, origin === base), credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Version'],
  exposedHeaders: ['x-app-version', 'x-min-client-version'], methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'] })
const api = createServer((req, res) => {
  requests.push({ method: req.method, url: req.url, headers: req.headers })
  if (outage === 'blocked' && req.url.startsWith('/api/state?')) {
    stateFailures++
    res.statusCode = 502
    return res.end('Bad Gateway')
  }
  corsHandler(req, res, () => {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('x-app-version', '0.1.0')
    res.setHeader('x-min-client-version', '0.1.0')
    const path = new URL(req.url, apiBase).pathname
    if (path === '/api/auth/login') return res.end(JSON.stringify({ user, token: 'test-token' }))
    if (path === '/api/auth/me') {
      if (req.headers.authorization !== 'Bearer test-token') { res.statusCode = 401; return res.end(JSON.stringify({ error: 'Non connecté' })) }
      return res.end(JSON.stringify({ user }))
    }
    if (path === '/api/state' && outage === 'once' && stateFailures++ === 0) {
      res.statusCode = 503
      return res.end(JSON.stringify({ error: 'Temporary outage' }))
    }
    if (path === '/api/state') return res.end(JSON.stringify({ state, version: 1, imageVersions: {} }))
    return res.end(JSON.stringify({ ok: true, token: 'test-token' }))
  })
})
const site = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, base).pathname.replace(/^\/itemstracker\//, '')
    if (path.includes('..')) throw new Error('Invalid path')
    let body = await readFile(resolve('dist', path || 'index.html'))
    if (path === 'assets/main.js') {
      assert.ok(body.includes('https://api.setup-hub.com'), 'Production bundle must use the verified custom API domain')
      body = Buffer.from(body.toString().replaceAll('https://api.setup-hub.com', apiBase))
    }
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[extname(path)] || 'application/octet-stream')
    res.end(body)
  } catch { res.statusCode = 404; res.end() }
})
try {
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve))
  apiBase = `http://127.0.0.1:${api.address().port}`
  await new Promise(resolve => site.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${site.address().port}`
  browser = await webkit.launch({ headless: true })
  const page = await browser.newPage()
  const failed = []
  page.on('requestfailed', req => failed.push(`${req.method()} ${req.url()}`))
  await page.goto(`${base}/itemstracker/app.html`)
  await page.locator('input[type=email]').fill(user.email)
  await page.locator('input[type=password]').fill('test-password-123!')
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await page.getByRole('heading', { name: /Bonjour, Test/ }).waitFor()
  assert.deepEqual(failed, [])
  assert.ok(requests.some(req => req.method === 'OPTIONS'), 'Real CORS preflight must occur')
  assert.ok(requests.some(req => req.method === 'POST' && req.url === '/api/auth/login'))
  assert.ok(requests.some(req => req.headers.authorization === 'Bearer test-token'))
  for (const req of requests.filter(req => req.method === 'GET')) assert.ok(new URL(req.url, apiBase).searchParams.get('__it_request'))
  for (const req of requests.filter(req => req.method === 'OPTIONS')) {
    assert.doesNotMatch(req.headers['access-control-request-headers'] || '', /cache-control|pragma/i)
  }
  console.log('WebKit: real cross-origin login and authenticated dashboard passed')
  outage = 'blocked'; stateFailures = 0
  await page.reload()
  await page.getByRole('alert').filter({ hasText: 'Impossible de charger tes données' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Se connecter', exact: true }).isEnabled(), true)
  assert.equal(await page.getByRole('button', { name: /réessayer/i }).count(), 0)
  assert.equal(stateFailures, 2, 'At most one automatic recovery, never endless requests')
  await page.waitForTimeout(3500)
  assert.equal(stateFailures, 2)
  console.log('WebKit: gateway/CORS failure stops infinite loading without an extra button')
  outage = 'once'; stateFailures = 0
  await page.reload()
  await page.getByRole('heading', { name: /Bonjour, Test/ }).waitFor()
  assert.equal(stateFailures, 2)
  console.log('WebKit: a temporary 503 recovers automatically')

} finally {
  await browser?.close()
  await Promise.all([new Promise(resolve => api.close(resolve)), new Promise(resolve => site.close(resolve))])
}
