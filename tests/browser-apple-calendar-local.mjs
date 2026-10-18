import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import pg from 'pg'
import argon2 from 'argon2'
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:local-preview-only@127.0.0.1:55432/postgres' })
let browser, userId
try {
  const email = `apple-calendar-${Date.now()}@local.test`, password = 'Calendar-Local-2026!'
  userId = (await pool.query('INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,$2,$3,NOW()) RETURNING id', [email, 'Calendar test', await argon2.hash(password)])).rows[0].id
  await pool.query("INSERT INTO academic_profiles(user_id,year_code,faculty_id,completed_at,legacy_exempt) VALUES($1,'Y4','bordeaux',NOW(),false)", [userId])
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = [], devices = []; let creations = 0
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/api/calendar/devices**', async route => {
    const req = route.request()
    if (req.url().endsWith('/revoke')) devices.splice(0)
    else if (req.method() === 'POST') {
      creations++
      devices.push({ id: 'test-device', label: req.postDataJSON().label, last_used_at: null })
      return route.fulfill({ json: { id: 'test-device', server: 'calendar.example.test', username: 'local-test', password: 'test-device-only', calendarUrl: 'https://calendar.example.test/calendar' } })
    }
    return route.fulfill({ json: { devices } })
  })
  await page.goto('http://127.0.0.1:5173/itemstracker/onboarding-preview.html')
  await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(email)
  await page.getByRole('textbox', { name: 'Mot de passe' }).fill(password)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Calendrier', exact: true }).click()
  const banner = page.locator('.cal-apple-banner'), connect = banner.getByRole('button', { name: 'Connecter Apple Calendrier', exact: true }), dialog = page.locator('.apple-setup-dialog')
  await connect.click()
  assert.equal(creations, 0)
  await page.getByRole('radio', { name: 'Mac', exact: true }).check()
  await expect(page.getByLabel('Nom de l’appareil', { exact: true })).toHaveValue('Mon Mac')
  await dialog.screenshot({ path: '/tmp/itemstracker-apple-wizard-device.png' })
  await dialog.getByRole('button', { name: 'Créer ma connexion', exact: true }).click()
  await expect(dialog.getByLabel('Mot de passe dédié', { exact: true })).toHaveValue('test-device-only')
  await expect(dialog).toContainText('Autre compte CalDAV → Manuel')
  assert.equal(creations, 1)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(connect).toBeFocused()
  await connect.click()
  await expect(dialog.getByLabel('Mot de passe dédié', { exact: true })).toBeVisible()
  assert.equal(creations, 1, 'Reopening the guide preserves the current credentials instead of creating another device')
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme)
    for (const width of [1440, 390, 360]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(dialog).toBeVisible()
      assert.ok(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1), `${theme} ${width}: dialog fits`)
      await dialog.screenshot({ path: `/tmp/itemstracker-apple-wizard-${theme}-${width}.png` })
    }
  }
  await dialog.getByRole('button', { name: 'J’ai ajouté le compte dans Apple Calendrier', exact: true }).click()
  await expect(dialog.getByLabel('Mot de passe dédié', { exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Voir mes appareils', exact: true }).click()
  await expect(dialog.getByText('Mon Mac', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Retirer', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirmer le retrait', exact: true }).click()
  await expect(dialog).toContainText('Aucun appareil connecté')
  await dialog.getByRole('button', { name: 'Fermer la connexion Apple Calendrier', exact: true }).click()
  assert.equal(await page.locator('.cal-apple').count(), 0, 'No old form remains below the banner')
  assert.deepEqual(errors, [])
  console.log('Apple Calendar: guided Mac setup, resume, no duplicate device, responsive light/dark, finish, device removal, Escape/focus: OK')
} finally {
  await browser?.close()
  if (userId) await pool.query('DELETE FROM users WHERE id=$1', [userId])
  await pool.end()
}
