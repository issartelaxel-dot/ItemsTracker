import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { chromium, webkit, expect } from '@playwright/test'
import pg from 'pg'
import argon2 from 'argon2'
import { createStateStore } from '../server/state-store.mjs'

// Local fixtures only: a long list must scroll without compressing its rows.
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:local-preview-only@127.0.0.1:55432/postgres' })
const store = createStateStore(pool)
const artifacts = new URL('../.test-preview-release/item-flashcards-scroll/', import.meta.url)
mkdirSync(artifacts, { recursive: true })
let userId, browser
try {
  const email = `flashcards-scroll-${randomUUID()}@local.test`, password = 'Local-Flashcards-2026!'
  userId = Number((await pool.query('INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,$2,$3,NOW()) RETURNING id',
    [email, 'Flashcards layout QA', await argon2.hash(password)])).rows[0].id)
  await pool.query("INSERT INTO academic_profiles(user_id,year_code,faculty_id,legacy_exempt,completed_at) VALUES($1,'Y4','dijon',TRUE,NOW())", [userId])
  await store.write(userId, 'state-full', {
    baseVersion: 0, requestId: randomUUID(), theme: 'light', focusMode: false,
    profile: { firstName: 'Flashcards layout QA' },
    trackingState: { items: { 154: {
      assignedColleges: [], byCollege: {},
      quiz: { cards: Array.from({ length: 40 }, (_, index) => ({
        id: `layout-${index + 1}`,
        question: `Question ${index + 1} : quels sont les éléments à connaître pour cette situation clinique ?`,
        answer: `Réponse ${index + 1}`, quizCount: 0,
      })), activeCardId: 'layout-40' },
    } } },
  })
  for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
    browser = await engine.launch({ headless: true, ...(name === 'chrome' ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {}) })
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.route(/https:\/\/(api\.setup-hub\.com|[^/]*onrender\.com)\//, route => route.abort())
    await page.goto('http://127.0.0.1:5173/itemstracker/onboarding-preview.html')
    await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(email)
    await page.getByRole('textbox', { name: 'Mot de passe' }).fill(password)
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    await page.locator('.sidebar-nav').getByRole('button', { name: 'Items', exact: true }).click()
    await page.getByRole('searchbox', { name: 'Rechercher un item', exact: true }).fill('154')
    await page.locator('.items-list-row').filter({ has: page.locator('.items-list-number', { hasText: /^#154$/ }) }).click()
    await page.locator('.item-detail-tabs').getByRole('button', { name: 'Flashcards', exact: true }).click()
    const list = page.locator('.quiz-card-list'), rows = list.locator('.quiz-card-row')
    await expect(rows).toHaveCount(40)
    for (const width of [1440, 1920, 820, 390]) {
      await page.setViewportSize({ width, height: 900 })
      if (width >= 1440) {
        await page.getByRole('button', { name: 'Matrice', exact: true }).click()
      }
      await rows.first().scrollIntoViewIfNeeded()
      const layout = await rows.evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect()
        return {
          top: box.top, bottom: box.bottom, height: box.height,
          childrenContained: [...node.children].every(child => {
            const rect = child.getBoundingClientRect()
            return rect.top >= box.top && rect.bottom <= box.bottom + 1
          }),
        }
      }))
      assert.ok(layout.every(row => row.childrenContained), `${name} ${width}: each card must contain its title, badge and actions`)
      assert.ok(layout.every((row, index) => !index || row.top >= layout[index - 1].bottom), `${name} ${width}: cards must not overlap`)
      const scroll = await list.evaluate(node => ({ height: node.clientHeight, content: node.scrollHeight }))
      assert.ok(scroll.content > scroll.height + 500, `${name} ${width}: the long list scrolls instead of shrinking cards`)
      await rows.last().scrollIntoViewIfNeeded()
      await expect(rows.last().getByRole('button', { name: /^Modifier / })).toBeInViewport()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.screenshot({ path: new URL(`${name}-${width}.png`, artifacts).pathname })
    }
    await rows.last().getByRole('button', { name: /^Modifier / }).click()
    await expect(page.locator('.quiz-modal')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.quiz-modal')).toHaveCount(0)
    await browser.close(); browser = null
    console.log(`${name}: 40 cards keep their full content, scroll without overlap, and remain editable at four widths.`)
  }
} finally {
  await browser?.close()
  if (userId) await pool.query('DELETE FROM users WHERE id=$1', [userId])
  await pool.end()
}
