import assert from 'node:assert/strict'
import { chromium, webkit, expect } from '@playwright/test'
import pg from 'pg'
import argon2 from 'argon2'
import { randomUUID } from 'node:crypto'
import { readFileSync, mkdirSync } from 'node:fs'
const dataset = JSON.parse(readFileSync(new URL('../src/data/item-reference-assignments.json', import.meta.url)))
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:local-preview-only@127.0.0.1:55432/postgres' })
const artifacts = new URL('../.test-preview-release/assignations-2026-10-18/', import.meta.url)
mkdirSync(artifacts, { recursive: true })
let browser, userIds = []
const college = (reviews = 0) => ({ favorite: false, reviews, mastery: 'Moyen', comments: '', lastReviewedAt: null, reviewHistory: [] })
async function user(name, legacy = false) {
  const email = `reference-${name}-${Date.now()}@local.test`, password = 'References-Local-2026!'
  const id = (await pool.query('INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,$2,$3,NOW()) RETURNING id', [email, 'References QA', await argon2.hash(password)])).rows[0].id
  userIds.push(id)
  await pool.query('INSERT INTO academic_profiles(user_id,year_code,faculty_id,legacy_exempt,completed_at) VALUES($1,$2,$3,$4,NOW())', [id, legacy ? 'Y5' : 'Y4', 'dijon', legacy])
  return { id, email, password }
}
async function login(page, account) {
  await page.goto('http://127.0.0.1:5173/itemstracker/onboarding-preview.html')
  await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(account.email)
  await page.getByRole('textbox', { name: 'Mot de passe' }).fill(account.password)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Items', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Rechercher un item', exact: true }).fill('293')
  await page.locator('.items-list-row').filter({ has: page.locator('.items-list-number', { hasText: /^#293$/ }) }).click()
}
async function api(account, route, options = {}) {
  const login = await fetch('http://127.0.0.1:8787/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password }) })
  const auth = await login.json(); assert.equal(login.status, 200)
  const r = await fetch('http://127.0.0.1:8787' + route, { ...options, headers: { 'content-type': 'application/json', 'x-client-version': '0.1.1', Authorization: 'Bearer ' + auth.token }, body: options.body ? JSON.stringify(options.body) : undefined })
  const result = await r.json(); assert.equal(r.status, 200, JSON.stringify(result)); return result
}
try {
  for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
    browser = await engine.launch({ headless: true, ...(name === 'chrome' ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {}) })
    let context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage()
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    const fresh = await user(name)
    await login(page, fresh)
    await expect(page.locator('#item-detail-tracking .college-card')).toHaveCount(2)
    await expect(page.locator('#item-detail-tracking')).toContainText('ANATOMIE ET CYTOLOGIE PATHOLOGIQUES')
    await expect(page.locator('#item-detail-tracking')).toContainText('CANCÉROLOGIE')
    await expect(page.locator('.item-detail-tag-row > span')).toHaveCount(2)
    const notes = page.getByRole('textbox', { name: 'Notes pour les prochaines lectures', exact: true })
    await notes.fill('Garder cette note de lecture')
    await expect.poll(async () => (await pool.query('SELECT data FROM user_tracking_items WHERE user_id=$1 AND item_number=293', [fresh.id])).rows[0]?.data?.itemComment, { timeout: 20000 }).toBe('Garder cette note de lecture')
    await page.reload()
    await page.locator('.sidebar-nav').getByRole('button', { name: 'Items', exact: true }).click()
    await page.getByRole('searchbox', { name: 'Rechercher un item', exact: true }).fill('293')
    await page.locator('.items-list-row').filter({ has: page.locator('.items-list-number', { hasText: /^#293$/ }) }).click()
    await expect.poll(async () => (await pool.query('SELECT COUNT(*)::int n FROM user_tracking_items WHERE user_id=$1', [fresh.id])).rows[0].n, { timeout: 20000 }).toBe(367)
    const saved = (await pool.query('SELECT item_number,data FROM user_tracking_items WHERE user_id=$1 ORDER BY item_number', [fresh.id])).rows
    for (const row of saved) assert.deepEqual(row.data.assignedColleges, dataset.items[row.item_number], `${name}: item ${row.item_number} matches reference contents`)
    await expect(notes).toHaveValue('Garder cette note de lecture')
    await page.getByRole('button', { name: 'Assignations', exact: true }).click()
    const picker = page.locator('#item-detail-assignments')
    await expect(picker.getByRole('checkbox')).toHaveCount(40)
    await expect(picker.getByRole('checkbox', { name: /CANCÉROLOGIE/ })).toBeDisabled()
    await expect(page.locator('.academic-assignment-provenance')).toContainText('Nexternat')
    await page.getByRole('button', { name: 'Déverrouiller les modifications', exact: true }).click()
    await picker.getByRole('checkbox', { name: /CANCÉROLOGIE/ }).uncheck()
    await expect.poll(async () => (await pool.query('SELECT data FROM user_tracking_items WHERE user_id=$1 AND item_number=293', [fresh.id])).rows[0]?.data?.assignedColleges, { timeout: 20000 }).toEqual(['ANATOMIE ET CYTOLOGIE PATHOLOGIQUES'])
    await page.reload()
    await page.locator('.sidebar-nav').getByRole('button', { name: 'Items', exact: true }).click()
    await page.getByRole('searchbox', { name: 'Rechercher un item', exact: true }).fill('293')
    await page.locator('.items-list-row').filter({ has: page.locator('.items-list-number', { hasText: /^#293$/ }) }).click()
    await expect(page.locator('#item-detail-tracking .college-card')).toHaveCount(1)
    await expect(notes).toHaveValue('Garder cette note de lecture')
    await context.close()

    const historical = await user(`${name}-historical`, true)
    await api(historical, '/api/state', { method: 'PUT', body: {
      baseVersion: 0, requestId: randomUUID(), theme: 'light', focusMode: false,
      trackingState: { items: {
        293: { assignedColleges: ['CANCÉROLOGIE', 'ANATOMIE ET CYTOLOGIE PATHOLOGIQUES'],
          byCollege: { 'CANCÉROLOGIE': college(1), 'ANATOMIE ET CYTOLOGIE PATHOLOGIQUES': college() },
          itemComment: 'Note historique à conserver', quizCount: 3,
          quiz: { enabled: true, cards: Array.from({ length: 5 }, (_, i) => ({ id: `saved-${i}`, question: `Question ${i}`, answer: 'Réponse conservée' })) } },
        1: { assignedColleges: [], byCollege: {}, itemComment: 'Affectations volontairement vides', quiz: { cards: [] } },
      } },
    } })
    const before = (await api(historical, '/api/state?imageMode=metadata')).state.trackingState
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); page = await context.newPage()
    page.on('pageerror', e => errors.push(e.message))
    await login(page, historical)
    await expect(page.locator('#item-detail-tracking .college-card')).toHaveCount(2)
    await expect(page.getByRole('textbox', { name: 'Notes pour les prochaines lectures', exact: true })).toHaveValue('Note historique à conserver')
    await expect(page.locator('.sidebar-grade')).toHaveText('5e année')
    await page.locator('.item-detail-tabs').getByRole('button', { name: 'Flashcards', exact: true }).click()
    await expect(page.locator('.quiz-card-row')).toHaveCount(5)
    await page.locator('.item-detail-tabs').getByRole('button', { name: 'Suivi des révisions', exact: true }).click()
    for (const width of [390, 820, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.screenshot({ path: new URL(`reference-preserved-${name}-${width}.png`, artifacts).pathname })
    }
    const after = (await api(historical, '/api/state?imageMode=metadata')).state.trackingState
    assert.deepEqual(after, before, 'Loading the candidate must not alter any historical state')
    assert.equal((await pool.query('SELECT year_code FROM academic_profiles WHERE user_id=$1', [historical.id])).rows[0].year_code, 'Y5')
    assert.deepEqual(errors, [])
    await context.close(); await browser.close(); browser = null
    console.log(`${name}: all 367 defaults persisted correctly; item 293 has two books; manual removal/notes survive reload; historical assignments, five cards, tracking and year unchanged; phone/tablet/desktop: OK`)
  }
} finally {
  await browser?.close()
  if (userIds.length) await pool.query('DELETE FROM users WHERE id=ANY($1::bigint[])', [userIds])
  await pool.end()
}
