import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { webkit } from '@playwright/test'

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname.replace(/^\/itemstracker\//, '')
    if (path.includes('..')) throw new Error('Invalid path')
    const body = await readFile(resolve('dist', path || 'index.html'))
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[extname(path)] || 'application/octet-stream')
    res.end(body)
  } catch { res.writeHead(404); res.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
let browser
try {
  browser = await webkit.launch({ headless: true })
  for (const scenario of ['compatible', 'obsolete']) {
    const context = await browser.newContext()
    let login = false, documents = 0
    await context.route('**/api/**', async route => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname
      const headers = { 'content-type': 'application/json', 'x-app-version': '0.2.0', 'x-min-client-version': '0.1.0',
        'access-control-allow-origin': base, 'access-control-allow-credentials': 'true',
        'access-control-expose-headers': 'x-app-version,x-min-client-version',
        'access-control-allow-headers': 'content-type,authorization,x-client-version', 'access-control-allow-methods': 'GET,POST' }
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
      let status = 200, body = {}
      if (pathname === '/api/auth/login') { login = true; body = { user: { id: 123, email: 'test@example.test' }, token: 'test-token' } }
      else if (pathname === '/api/auth/me') {
        status = 401; body = { error: 'Non connecté' }
        if (login && scenario === 'compatible') { status = 200; body = { user: { id: 123, email: 'test@example.test', displayName: 'Test' } } }
        if (login && scenario === 'obsolete') { status = 426; headers['x-min-client-version'] = '0.3.0'; body = { code: 'CLIENT_STALE', minClientVersion: '0.3.0' } }
      }
      if (pathname === '/api/state') body = { version: 1, imageVersions: {}, state: {
        trackingState: { items: {} }, theme: 'light', focusMode: false, dateFormat: 'fr-short', timeZone: 'auto',
        youtubeDisplayMode: 'embed', shuffleQuizCards: false,
        profile: { firstName: 'Test', lastName: 'Local', email: 'test@example.test', photoUrl: '', password: '', avatarGradient: 'red' },
      } }
      return route.fulfill({ status, headers, body: JSON.stringify(body) })
    })
    const page = await context.newPage()
    page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++ })
    await page.goto(`${base}/itemstracker/app.html`)
    await page.getByRole('button', { name: 'Se connecter', exact: true }).waitFor()
    await page.locator('input[type=email]').fill('test@example.test')
    await page.locator('input[type=password]').fill('example-password!')
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    if (scenario === 'compatible') {
      await page.getByRole('heading', { name: /Bonjour, Test/ }).waitFor()
      assert.equal(documents, 1, 'Compatible release mismatch should not reload')
      assert.equal(await page.getByText('Client obsolète', { exact: false }).count(), 0)
    } else {
      await page.waitForURL('**/*__it_refresh=0.3.0*')
      await page.getByText('La version disponible sur le site est encore obsolète.', { exact: false }).waitFor()
      assert.equal(documents, 2, 'One automatic reload, then a useful deployment error')
      assert.ok(new URL(page.url()).searchParams.get('__it_cache'))
    }
    await context.close()
    console.log(`WebKit: ${scenario} passed`)
  }
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
