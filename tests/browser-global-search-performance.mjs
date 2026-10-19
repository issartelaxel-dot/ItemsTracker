import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium, expect } from '@playwright/test'
import pg from 'pg'
import argon2 from 'argon2'
import { createStateStore } from '../server/state-store.mjs'

const baseline = process.argv.includes('--baseline')
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:local-preview-only@127.0.0.1:55432/postgres' })
const artifacts = new URL('../.test-preview-release/global-search-performance/', import.meta.url)
mkdirSync(artifacts, { recursive: true })
let userId, browser
try {
  const email = `search-performance-${randomUUID()}@local.test`, password = 'Local-Search-2026!'
  userId = Number((await pool.query('INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,$2,$3,NOW()) RETURNING id',
    [email, 'Search performance QA', await argon2.hash(password)])).rows[0].id)
  await pool.query("INSERT INTO academic_profiles(user_id,year_code,legacy_exempt,completed_at) VALUES($1,'Y4',TRUE,NOW())", [userId])
  await createStateStore(pool).write(userId, 'state-full', {
    baseVersion: 0, requestId: randomUUID(), theme: 'light', focusMode: false, profile: { firstName: 'Search performance QA' },
    trackingState: { items: { 154: {
      assignedColleges: ['PNEUMOLOGIE'], byCollege: {},
      quiz: { cards: Array.from({ length: 3000 }, (_, index) => ({
        id: `performance-${index}`, question: `<p><strong>Diagnostic pneumologie ${index}</strong></p><p>Quels examens et signes rechercher chez ce patient ?</p>`,
        answer: '<p>Examen clinique et examens complémentaires.</p><ul><li>Contexte et facteurs de risque</li><li>Signes respiratoires</li><li>Surveillance</li></ul>',
        personalNotes: `Note synthétique ${index}`, quizCount: 0,
      })) },
    } } },
  })
  browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.setDefaultTimeout(30000)
  await page.route(/https:\/\/(api\.setup-hub\.com|[^/]*onrender\.com)\//, route => route.abort())
  await page.goto('http://127.0.0.1:5173/itemstracker/onboarding-preview.html')
  await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(email)
  await page.getByRole('textbox', { name: 'Mot de passe' }).fill(password)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page.locator('.dashboard-layout')).toBeVisible({ timeout: 60000 })
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Items', exact: true }).click()
  const input = page.getByRole('searchbox', { name: 'Recherche globale', exact: true })
  await input.fill('pneumologie')
  await expect(page.locator('.global-search-result')).toHaveCount(12, { timeout: 60000 })
  await input.fill('')
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.evaluate(() => {
    const metrics = window.__searchPerformance = { documents: 0, latencies: [], values: [] }
    const original = document.implementation.createHTMLDocument.bind(document.implementation)
    document.implementation.createHTMLDocument = (...args) => { metrics.documents++; return original(...args) }
    document.querySelector('.topbar-search input').addEventListener('input', event => {
      const start = performance.now()
      metrics.values.push(event.target.value)
      requestAnimationFrame(() => setTimeout(() => metrics.latencies.push(performance.now() - start), 0))
    }, true)
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const started = performance.now()
  await input.pressSequentially('pneumologie', { delay: 0, timeout: 120000 })
  await expect(input).toHaveValue('pneumologie')
  await expect(page.locator('.global-search-result')).toHaveCount(12)
  if (!baseline) await expect(page.locator('.global-search-panel')).toHaveAttribute('aria-busy', 'false')
  await expect.poll(() => page.evaluate(() => window.__searchPerformance.latencies.length)).toBe(11)
  const metrics = await page.evaluate(() => window.__searchPerformance)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  const latencies = [...metrics.latencies].sort((a, b) => a - b)
  const report = { mode: baseline ? 'baseline' : 'optimized', cards: 3000, cpuSlowdown: 4,
    typedCharacters: metrics.values.length, htmlDocumentsDuringTyping: metrics.documents,
    medianInputToNextFrameMs: latencies[Math.floor(latencies.length / 2)], p95InputToNextFrameMs: latencies[Math.ceil(latencies.length * .95) - 1],
    totalTypingAndResultsMs: performance.now() - started, measuredAt: new Date().toISOString() }
  writeFileSync(new URL(`${report.mode}.json`, artifacts), JSON.stringify(report, null, 2), { mode: 0o600 })
  console.log(JSON.stringify(report))
  if (!baseline) assert.equal(metrics.documents, 0, 'Typing must never reparse flashcard HTML')
  if (!baseline) {
    await input.fill('20')
    await expect(page.locator('.global-search-result-title').first()).toHaveText('Item #20')
    await input.fill('154')
    await input.press('Enter')
    await expect(page.locator('.item-detail-hero h2')).toHaveText('Item #154')
    await expect(input).toHaveValue('')
    await expect(page.locator('.global-search-panel')).toHaveCount(0)
    await page.getByRole('textbox', { name: 'Notes pour les prochaines lectures', exact: true }).fill('Recherche index actualise unique')
    await input.fill('index actualise unique')
    await expect(page.locator('.global-search-result-title')).toHaveText(['Item #154'])
    console.log('Enter selects the latest query; an edited item note is immediately searchable.')
  }
} finally {
  await browser?.close()
  if (userId) await pool.query('DELETE FROM users WHERE id=$1', [userId])
  await pool.end()
}
