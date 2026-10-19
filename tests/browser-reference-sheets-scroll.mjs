import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { chromium, webkit, expect } from '@playwright/test'
import pg from 'pg'
import argon2 from 'argon2'
import { createStateStore } from '../server/state-store.mjs'

const pool = new pg.Pool({ connectionString: 'postgresql://postgres:local-preview-only@127.0.0.1:55432/postgres' })
const artifacts = new URL('../.test-preview-release/reference-sheets-scroll/', import.meta.url)
mkdirSync(artifacts, { recursive: true })
const sheet = name => ({ id: name, name, url: '', color: 'jaune', tracking: {
  reviews: 1, favorite: true, mastery: 'Moyen', comments: 'Saved sheet note',
  lastReviewedAt: '2026-10-01T10:00:00.000Z', reviewHistory: [{ date: '2026-10-01T10:00:00.000Z', delta: 1 }],
} })
let userId, browser
try {
  const email = `sheet-scroll-${randomUUID()}@local.test`, password = 'Local-Sheets-2026!'
  userId = Number((await pool.query('INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,$2,$3,NOW()) RETURNING id',
    [email, 'Sheet scroll QA', await argon2.hash(password)])).rows[0].id)
  await pool.query("INSERT INTO academic_profiles(user_id,year_code,faculty_id,legacy_exempt,completed_at) VALUES($1,'Y4','dijon',TRUE,NOW())", [userId])
  await createStateStore(pool).write(userId, 'state-full', {
    baseVersion: 0, requestId: randomUUID(), theme: 'light', focusMode: false, profile: { firstName: 'Sheet scroll QA' },
    trackingState: { items: { 150: {
      assignedColleges: [], byCollege: {}, lisaSheets: [sheet('Fiche 150')],
      platformSheets: [sheet('Fiche EDNi'), sheet('Fiche LMG')],
    } } },
  })
  for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
    browser = await engine.launch({ headless: true, ...(name === 'chrome' ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {}) })
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    page.on('response', response => {
      if (response.url().includes('/api/state') && response.status() >= 400) console.log(`${name}: state request returned ${response.status()}`)
    })
    await page.route(/https:\/\/(api\.setup-hub\.com|[^/]*onrender\.com)\//, route => route.abort())
    await page.goto('http://127.0.0.1:5173/itemstracker/onboarding-preview.html')
    await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(email)
    await page.getByRole('textbox', { name: 'Mot de passe' }).fill(password)
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    await page.locator('.sidebar-nav').getByRole('button', { name: 'Items', exact: true }).click()
    await page.getByRole('searchbox', { name: 'Rechercher un item', exact: true }).fill('150')
    await page.locator('.items-list-row').filter({ has: page.locator('.items-list-number', { hasText: /^#150$/ }) }).click()
    for (const width of [1440, 1920, 1200, 390]) {
      await page.setViewportSize({ width, height: 900 })
      const clipping = await page.locator('.reference-grid').evaluateAll(nodes => nodes.map(node => ({
        height: node.clientHeight, content: node.scrollHeight,
      })))
      assert.ok(clipping.every(group => group.content <= group.height + 1), `${name} ${width}: sheets and add buttons must not be clipped inside a hidden overflow region`)
      // Scroll the normal page/panel, without scrollIntoView's hidden-container assistance.
      await page.locator('.item-detail-panel').evaluate(panel => {
        for (let node = panel; node; node = node.parentElement) {
          if (['auto', 'scroll'].includes(getComputedStyle(node).overflowY)) node.scrollTop = node.scrollHeight
        }
        window.scrollTo(0, document.documentElement.scrollHeight)
      })
      const add = page.getByRole('button', { name: '+ Ajouter fiche plateforme', exact: true })
      await expect(add).toBeInViewport({ ratio: 1 })
      await add.click({ trial: true })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.screenshot({ path: new URL(`${name}-${width}.png`, artifacts).pathname })
    }
    await page.getByRole('button', { name: '+ Ajouter fiche plateforme', exact: true }).click()
    await expect(page.locator('.reference-card')).toHaveCount(name === 'chrome' ? 4 : 5)
    await expect.poll(async () => (await pool.query("SELECT jsonb_array_length(data->'platformSheets') n FROM user_tracking_items WHERE user_id=$1 AND item_number=150", [userId])).rows[0].n, { timeout: 20000 }).toBe(name === 'chrome' ? 3 : 4)
    await browser.close(); browser = null
    console.log(`${name}: LISA and platform sheets are fully reachable with normal scrolling at four widths; the bottom add action works.`)
  }
} finally {
  await browser?.close()
  if (userId) await pool.query('DELETE FROM users WHERE id=$1', [userId])
  await pool.end()
}
