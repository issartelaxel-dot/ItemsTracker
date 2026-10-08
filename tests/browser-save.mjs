// Run separately: requires Chrome or a Playwright Chromium installation.
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { mergePatch } from '../server/state-model.mjs'
const socket = net.createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const base = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
let browser
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/ItemsTracker/`)).ok) break } catch {} await delay(50) }
  browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_PATH ? { executablePath: process.env.TEST_BROWSER_PATH }
    : process.platform === 'darwin' ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {}) })
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  let state = { trackingState: { items: {} }, theme: 'light', focusMode: false, dateFormat: 'fr-short', timeZone: 'auto',
    youtubeDisplayMode: 'embed', shuffleQuizCards: false, profile: { firstName: 'Test', lastName: 'Local', email: 'test@example.test', photoUrl: '', password: '', avatarGradient: 'red' } }
  let version = 1, stateReads = 0, pauseNext = false, releaseSave
  let heldSave = null
  const saves = [], savedById = new Map()
  await context.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    const headers = { 'Content-Type': 'application/json', 'x-app-version': '0.1.0', 'access-control-allow-origin': base,
      'access-control-allow-credentials': 'true', 'access-control-expose-headers': 'x-app-version' }
    const answer = body => route.fulfill({ status: 200, headers, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'access-control-allow-headers': 'content-type,authorization,x-client-version', 'access-control-allow-methods': 'GET,PUT,PATCH,POST' } })
    if (url.pathname === '/api/auth/me') return answer({ user: { id: 123, email: 'test@example.test', displayName: 'Test Local' }, token: 'test-token' })
    if (url.pathname === '/api/session') return answer({ ok: true, token: 'test-token' })
    if (url.pathname === '/api/state' && req.method() === 'GET') { stateReads++; return answer({ state: { ...state, updatedAt: new Date().toISOString() }, version, imageVersions: {} }) }
    if (url.pathname === '/api/state' && ['PATCH', 'PUT'].includes(req.method())) {
      const body = req.postDataJSON()
      saves.push({ body, text: req.postData(), method: req.method(), stateReads })
      if (savedById.has(body.requestId)) return stateReads === 1 ? route.abort('internetdisconnected') : answer(savedById.get(body.requestId))
      if (pauseNext) { pauseNext = false; heldSave = new Promise(resolve => { releaseSave = resolve }); await heldSave }
      assert.equal(body.baseVersion, version)
      state = req.method() === 'PATCH' ? mergePatch(state, body.patch) : body
      version++
      const ack = { ok: true, version, updatedAt: new Date().toISOString() }
      savedById.set(body.requestId, ack)
      // The server committed, but the client never receives the first ACK.
      if (saves.length === 1) return route.abort('internetdisconnected')
      return answer(ack)
    }
    return answer({ ok: true })
  })
  // Prevent any real provider calls even if an unexpected URL is introduced.
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' || route.request().url().includes('/api/') ? route.fallback() : route.abort())
  await page.goto(`${base}/ItemsTracker/`)
  await expect(page.getByRole('button', { name: 'Activer le thème sombre' })).toBeVisible({ timeout: 15000 }).catch(async e => { console.log('Page text:', (await page.locator('body').innerText()).slice(0, 2000)); console.log('Page errors:', errors); throw e })
  await page.getByRole('button', { name: 'Activer le thème sombre' }).click()
  await expect.poll(() => saves.length, { timeout: 10000 }).toBe(1)
  await expect(page.locator('.topbar-save-warning')).toContainText('Sauvegarde en attente')
  const pending = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('itemstracker-save-recovery', 1); r.onsuccess = () => resolve(r.result); r.onerror = reject })
    return new Promise(resolve => { const r = db.transaction('drafts').objectStore('drafts').getAll(); r.onsuccess = () => resolve(r.result) })
  })
  assert.equal(pending.length, 1); assert.equal(pending[0].operation.id, saves[0].body.requestId)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Activer le thème clair' })).toBeVisible({ timeout: 15000 })
  await expect.poll(() => saves.at(-1)?.stateReads, { timeout: 15000 }).toBe(2)
  for (const save of saves) assert.equal(save.text, saves[0].text)
  assert.equal(version, 2)
  await expect(page.locator('.topbar-save-warning')).toHaveCount(0)
  assert.deepEqual(errors, [])
  const countBeforeRace = saves.length
  pauseNext = true
  await page.getByRole('button', { name: 'Activer le thème clair' }).click()
  await expect.poll(() => saves.length, { timeout: 10000 }).toBe(countBeforeRace + 1)
  await page.getByRole('button', { name: 'Activer le thème sombre' }).click()
  await expect(page.getByRole('button', { name: 'Activer le thème clair' })).toBeVisible()
  releaseSave()
  await expect.poll(() => saves.length, { timeout: 10000 }).toBe(countBeforeRace + 2)
  await expect.poll(() => version).toBe(4)
  assert.equal(state.theme, 'dark')
  assert.equal(saves.at(-2).body.patch.theme, 'light')
  assert.equal(saves.at(-1).body.patch.theme, 'dark')
  assert.notEqual(saves.at(-1).body.requestId, saves.at(-2).body.requestId)
  console.log('Browser check passed: durable draft; lost ACK replay after reload; edits made during an in-flight save are retained and committed separately.')
  await context.close()
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
  await new Promise(resolve => server.once('exit', resolve))
}
