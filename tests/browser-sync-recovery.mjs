// Isolated API: never connects to a real account. An optional local export can
// exercise the recovery with a larger dataset without copying it into the repo.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { webkit, expect } from '@playwright/test'
import { mergePatch } from '../server/state-model.mjs'

const staticDir = process.env.SYNC_RECOVERY_STATIC_DIR
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js',
  ...(staticDir ? ['preview', '--outDir', staticDir] : []),
  '--host', '127.0.0.1', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] })
let browser
try {
  const base = await new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error('Vite startup timed out')), 15000)
    server.stdout.on('data', chunk => {
      output += chunk.toString()
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/)
      if (match) { clearTimeout(timer); resolve(match[0]) }
    })
    server.once('exit', () => { clearTimeout(timer); reject(new Error('Vite exited')) })
  })
  const local = process.env.RECOVERY_EXPORT_PATH
    ? JSON.parse(await fs.readFile(process.env.RECOVERY_EXPORT_PATH, 'utf8')).data
    : { trackingState: { items: { 1: { itemComment: 'Local note', quiz: { cards: [] } } } },
      theme: 'light', focusMode: false, dateFormat: 'fr-short', timeZone: 'auto', youtubeDisplayMode: 'embed', shuffleQuizCards: false, profile: {} }
  browser = await webkit.launch({ headless: true })
  for (const scenario of ['missing-baseline', 'read-failure']) {
    const context = await browser.newContext({ acceptDownloads: true })
    await context.addInitScript(async ({ local, base }) => {
      if (location.origin !== base) return
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('itemstracker-save-recovery', 1)
        req.onupgradeneeded = () => req.result.createObjectStore('drafts', { keyPath: 'key' })
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      await new Promise((resolve, reject) => {
        const tx = db.transaction('drafts', 'readwrite')
        tx.objectStore('drafts').put({ key: '123:recovery-test', userId: 123, body: JSON.stringify(local), baseBody: '', baseVersion: 1,
          imageBaseline: {}, imageVersions: {}, operation: null, savedAtMs: Date.now() })
        tx.oncomplete = resolve; tx.onerror = reject
      })
      db.close()
    }, { local, base })
    let state = structuredClone(local), version = 2, reads = 0, writes = 0
    state.trackingState.items[1].itemComment = 'Cloud note'
    const headers = { 'content-type': 'application/json', 'x-app-version': '0.1.1' }
    await context.route('**/api/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname.replace(/^\/itemstracker\/api\//, '/api/')
      const answer = body => route.fulfill({ headers, body: JSON.stringify(body) })
      if (path === '/api/auth/me') return answer({ user: { id: 123, email: 'test@example.test', displayName: 'Test' } })
      if (path === '/api/state' && req.method() === 'GET') {
        if (++reads > 1 && scenario === 'read-failure') return route.fulfill({ status: 503, headers, body: JSON.stringify({ error: 'Serveur temporairement indisponible.' }) })
        return answer({ state, version, imageVersions: {} })
      }
      if (path === '/api/state' && ['PUT', 'PATCH'].includes(req.method())) {
        const body = req.postDataJSON()
        assert.equal(body.baseVersion, version)
        state = req.method() === 'PATCH' ? mergePatch(state, body.patch) : body
        writes++
        return answer({ ok: true, version: ++version, updatedAt: new Date().toISOString() })
      }
      return answer({ ok: true })
    })
    await context.route('**/*', route => new URL(route.request().url()).origin === base || new URL(route.request().url()).pathname.startsWith('/api/') ? route.fallback() : route.abort())
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}/itemstracker/${staticDir ? 'app.html' : 'index.dev.html'}`)
    const banner = page.locator('.save-lock-banner')
    await expect(banner).toBeVisible({ timeout: 20000 })
    await banner.getByRole('button', { name: 'Synchroniser', exact: true }).click()
    if (scenario === 'read-failure') {
      await expect(banner).toContainText('Serveur temporairement indisponible.')
      assert.equal(writes, 0)
    } else {
      const keepLocal = banner.getByRole('button', { name: 'Conserver mes changements locaux' })
      await expect(keepLocal).toBeVisible()
      assert.equal(writes, 0, 'Missing history must require an explicit choice')
      const download = page.waitForEvent('download')
      await keepLocal.click()
      const file = await download
      const backup = JSON.parse(await fs.readFile(await file.path(), 'utf8'))
      assert.deepEqual(backup.data.trackingState, local.trackingState)
      await expect(banner).toHaveCount(0)
      await expect.poll(() => writes, { timeout: 10000 }).toBe(1)
      assert.deepEqual(state.trackingState, local.trackingState)
    }
    assert.deepEqual(errors, [])
    console.log(`WebKit recovery passed: ${scenario}`)
    await context.close()
  }
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
