import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { chromium, webkit, expect } from '@playwright/test'
import pg from 'pg'
import argon2 from 'argon2'

const pool = new pg.Pool({ connectionString: 'postgresql://postgres:local-preview-only@127.0.0.1:55432/postgres' })
const artifacts = new URL('../.test-preview-release/global-search-layout/', import.meta.url)
mkdirSync(artifacts, { recursive: true })
let userId, browser
try {
  const email = `search-layout-${randomUUID()}@local.test`, password = 'Local-Search-2026!'
  userId = Number((await pool.query('INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,$2,$3,NOW()) RETURNING id',
    [email, 'Search layout QA', await argon2.hash(password)])).rows[0].id)
  await pool.query("INSERT INTO academic_profiles(user_id,year_code,legacy_exempt,completed_at) VALUES($1,'Y4',TRUE,NOW())", [userId])
  for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
    browser = await engine.launch({ headless: true, ...(name === 'chrome' ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {}) })
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    page.setDefaultTimeout(10000)
    await page.route(/https:\/\/(api\.setup-hub\.com|[^/]*onrender\.com)\//, route => route.abort())
    await page.goto('http://127.0.0.1:5173/itemstracker/onboarding-preview.html')
    await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(email)
    await page.getByRole('textbox', { name: 'Mot de passe' }).fill(password)
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    await expect(page.locator('.dashboard-layout')).toBeVisible()
    await page.locator('.sidebar-nav').getByRole('button', { name: 'Items', exact: true }).click()
    for (const width of [1440, 1920, 820, 390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      // The compact mobile Items list has its own search and hides the topbar.
      if (width === 390) await page.locator('.mobile-bottom-nav').getByRole('button', { name: 'Dashboard', exact: true }).click()
      const input = page.getByRole('searchbox', { name: 'Recherche globale', exact: true })
      if (!(await input.isVisible())) await page.getByRole('button', { name: 'Recherche globale', exact: true }).click()
      await input.fill('20')
      const panel = page.getByRole('listbox', { name: 'Résultats de recherche globale' })
      await expect(panel.getByRole('option')).toHaveCount(12)
      const bounds = await panel.getByRole('option').evaluateAll(nodes => nodes.map(node => {
        const row = node.getBoundingClientRect(), main = node.querySelector('.global-search-result-main').getBoundingClientRect(),
          meta = node.querySelector('.global-search-result-meta').getBoundingClientRect(), small = node.querySelector('small')?.getBoundingClientRect()
        return {
          mainWidth: main.width,
          metadataContained: !small || (small.left >= meta.left - 1 && small.right <= meta.right + 1),
          columnsSeparated: meta.top >= main.bottom - 1 || meta.left >= main.right - 1,
          rowContainsText: [main, meta].every(rect => rect.top >= row.top - 1 && rect.bottom <= row.bottom + 1),
        }
      }))
      assert.ok(bounds.every(row => row.metadataContained && row.columnsSeparated && row.rowContainsText), `${name} ${width}: long reference names must not overlap titles or adjacent results`)
      assert.ok(bounds.every(row => row.mainWidth >= 80), `${name} ${width}: item titles retain a readable column`)
      await page.locator('.global-search-list').evaluate(node => { node.scrollTop = node.scrollHeight })
      const last = panel.getByRole('option').last()
      const visible = await last.evaluate(node => {
        const box = node.getBoundingClientRect(), panel = node.closest('.global-search-panel').getBoundingClientRect()
        return box.bottom <= panel.bottom + 1 && box.top >= panel.top
      })
      assert.ok(visible, `${name} ${width}: the last result stays reachable through the result list scrollbar`)
      await last.click({ trial: true })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.screenshot({ path: new URL(`${name}-${width}.png`, artifacts).pathname })
      await page.locator('.global-search-list').evaluate(node => { node.scrollTop = 0 })
    }
    await page.keyboard.press('Escape')
    await expect(page.locator('.global-search-panel')).toHaveCount(0)
    await page.getByRole('searchbox', { name: 'Recherche globale', exact: true }).fill('')
    await page.getByRole('searchbox', { name: 'Recherche globale', exact: true }).fill('20')
    await page.locator('.global-search-result').filter({ has: page.locator('.global-search-result-title', { hasText: /^Item #20$/ }) }).click()
    await expect(page.locator('.item-detail-hero h2')).toHaveText('Item #20')
    await browser.close(); browser = null
    console.log(`${name}: long result labels stay separated, all 12 results scroll into view, Escape closes and selecting an item opens it at five widths.`)
  }
} finally {
  await browser?.close()
  if (userId) await pool.query('DELETE FROM users WHERE id=$1', [userId])
  await pool.end()
}
