import pg from 'pg'
import argon2 from 'argon2'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium, webkit, expect } from '@playwright/test'

const pool = new pg.Pool({ connectionString: 'postgresql://postgres:local-preview-only@127.0.0.1:55432/postgres' })
const out = new URL('../.test-preview-release/ux-audit/', import.meta.url)
await fs.mkdir(out, { recursive: true })
let id, browser
const measurements = []
try {
  for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
    const email = `revision-journey-${name}-${Date.now()}@local.test`, password = 'Local-Journey-2026!'
    id = (await pool.query('INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,$2,$3,NOW()) RETURNING id', [email, 'Parcours révision', await argon2.hash(password)])).rows[0].id
    await pool.query("INSERT INTO academic_profiles(user_id,year_code,faculty_id,completed_at,legacy_exempt) VALUES($1,'Y4','dijon',NOW(),false)", [id])
    browser = await engine.launch({ headless: true, ...(name === 'chrome' ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {}) })
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    page.setDefaultTimeout(15000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:5173/itemstracker/onboarding-preview.html')
    await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(email)
    await page.getByRole('textbox', { name: 'Mot de passe' }).fill(password)
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    await page.locator('.sidebar-nav').getByRole('button', { name: 'Flashcards', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Crée ta première flashcard' })).toBeVisible()
    await expect(page.locator('.flash-status-group')).toHaveCount(0)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: new URL(`after-empty-${name}-390.png`, out).pathname })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.locator('.sidebar-nav').getByRole('button', { name: 'Items', exact: true }).click()
    await page.getByRole('searchbox', { name: 'Rechercher un item', exact: true }).fill('81')
    await page.locator('.items-list-row').filter({ has: page.locator('.items-list-number', { hasText: /^#81$/ }) }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    const create = page.getByRole('button', { name: 'Créer une flashcard pour l’item 81', exact: true })
    await expect(create).toBeEnabled()
    await create.click()
    const creator = page.getByRole('dialog', { name: 'Créer une flashcard', exact: true })
    await expect(creator).toContainText('Item #81 · Rédige ta question et sa réponse.')
    await expect(creator.getByRole('searchbox')).toHaveCount(0)
    await creator.locator('.flash-generator-modal-nav').getByRole('button', { name: 'Annuler', exact: true }).click()
    await expect(page.locator('.item-detail-hero h2')).toHaveText('Item #81')
    await create.click()
    await creator.locator('.quiz-rich-editable').nth(0).fill('Quels signes évoquent une altération chronique de la vision ?')
    await creator.locator('.quiz-rich-editable').nth(1).fill('Rechercher les signes fonctionnels et réaliser un examen ophtalmologique.')
    await creator.getByRole('button', { name: 'Créer la flashcard', exact: true }).click()
    await expect(creator).toHaveCount(0)
    await expect(page.locator('.flashcards-list-modal')).toHaveCount(0)
    await expect(page.locator('.item-detail-hero h2')).toHaveText('Item #81')
    await expect(page.locator('.quiz-card-row')).toHaveCount(1)
    await page.getByRole('textbox', { name: 'Notes pour les prochaines lectures', exact: true }).fill('Revoir les signes d’alerte.')
    await page.getByRole('button', { name: 'Lancer une révision', exact: true }).click()
    const modal = page.getByRole('dialog', { name: 'Révision', exact: true })
    await expect(modal.getByRole('button', { name: /À réviser aujourd’hui/ })).toBeVisible()
    await expect(modal.getByRole('button', { name: /Par difficulté/ })).toBeVisible()
    for (const [width, height] of [[320, 568], [390, 844], [820, 1180], [1440, 900]]) {
      await page.setViewportSize({ width, height })
      const startButton = modal.getByRole('button', { name: 'Commencer', exact: true })
      await expect.poll(async () => (await startButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
      const start = await startButton.boundingBox()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      measurements.push({ browser: name, width, height, startY: start.y, startHeight: start.height })
      if (width === 390 || width === 820) await page.screenshot({ path: new URL(`after-setup-${name}-${width}.png`, out).pathname })
    }
    await expect(modal.getByRole('button', { name: /Par difficulté/ })).toBeVisible()
    await modal.getByRole('button', { name: 'QCM', exact: true }).click()
    await expect(modal.getByRole('button', { name: 'QCM', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await modal.getByRole('button', { name: 'Flashcards', exact: true }).click()
    await modal.getByRole('button', { name: 'Toutes', exact: true }).click()
    await expect(modal.getByRole('button', { name: 'Toutes', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.setViewportSize({ width: 390, height: 844 })
    await modal.getByRole('button', { name: 'Commencer', exact: true }).click()
    await expect(modal.locator('.quiz-study-card-body')).toContainText('Quels signes évoquent')
    await modal.getByRole('button', { name: 'Afficher la réponse', exact: true }).click()
    await expect(modal.locator('.quiz-study-card-body')).toContainText('Rechercher les signes fonctionnels')
    await modal.getByRole('button', { name: 'Facile', exact: true }).click()
    await expect(modal.locator('.quiz-summary-celebration')).toBeVisible()
    await expect.poll(async () => {
      const data = (await pool.query('SELECT data FROM user_tracking_items WHERE user_id=$1 AND item_number=81', [id])).rows[0]?.data
      const card = (await pool.query('SELECT data FROM user_quiz_cards WHERE user_id=$1 AND item_number=81', [id])).rows[0]?.data
      return { result: card?.lastResult, count: card?.quizCount, notes: data?.itemComment }
    }, { timeout: 20000 }).toEqual({ result: 'good', count: 1, notes: 'Revoir les signes d’alerte.' })
    await modal.getByRole('button', { name: 'Quitter', exact: true }).click()
    await expect(page.locator('.item-detail-hero h2')).toHaveText('Item #81')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.locator('.sidebar-nav').getByRole('button', { name: 'Flashcards', exact: true }).click()
    await page.getByRole('group', { name: 'Organisation des flashcards' }).getByRole('button', { name: 'Statut', exact: true }).click()
    const search = page.getByRole('searchbox', { name: 'Rechercher une thématique ou un item', exact: true })
    await search.fill('aucun-resultat-xyz')
    await expect(page.getByRole('heading', { name: 'Aucune carte dans cette sélection' })).toBeVisible()
    await page.locator('.flashcards-guided-empty').getByRole('button', { name: 'Réinitialiser les filtres', exact: true }).click()
    await expect(search).toHaveValue('')
    await expect(page.locator('.flash-feeling-good .flash-status-count')).toHaveText('1 carte')
    await page.getByRole('group', { name: 'Organisation des flashcards' }).getByRole('button', { name: 'Collège', exact: true }).click()
    const emptyCollege = page.locator('.flashcards-college-card').filter({ has: page.locator('.flashcards-card-launch[data-short-label="Créer"]') }).first()
    await emptyCollege.locator('.flashcards-card-launch').click()
    await expect(creator).toBeVisible()
    await creator.locator('.flash-generator-modal-nav').getByRole('button', { name: 'Annuler', exact: true }).click()
    assert.deepEqual(errors, [])
    await browser.close(); browser = null
    await pool.query('DELETE FROM users WHERE id=$1', [id]); id = null
    console.log(`${name}: guided empty state, contextual creation/cancel, direct start at four sizes, advanced options, full revision and database persistence, filter reset, empty college creation: OK`)
  }
  await fs.writeFile(new URL('after.json', out), JSON.stringify(measurements, null, 2))
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0]
  if (page) {
    await page.screenshot({ path: new URL('failure.png', out).pathname })
    await fs.writeFile(new URL('failure.txt', out), await page.locator('body').innerText())
  }
  throw error
} finally {
  await browser?.close()
  if (id) await pool.query('DELETE FROM users WHERE id=$1', [id])
  await pool.end()
}
