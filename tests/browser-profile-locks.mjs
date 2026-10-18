import pg from 'pg'
import argon2 from 'argon2'
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:local-preview-only@127.0.0.1:55432/postgres' })
let userId, browser
try {
  const email = `profile-locks-${Date.now()}@local.test`
  userId = (await pool.query('INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,$2,$3,$4) RETURNING id', [email, 'Test local', await argon2.hash('Locks-Local-2026!'), new Date().toISOString()])).rows[0].id
  await pool.query("INSERT INTO academic_profiles(user_id,year_code,faculty_id,legacy_exempt,completed_at) VALUES($1,'Y4','bordeaux',false,NOW())", [userId])
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto('http://127.0.0.1:5173/itemstracker/onboarding-preview.html')
  await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(email)
  await page.getByRole('textbox', { name: 'Mot de passe' }).fill('Locks-Local-2026!')
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await page.locator('.sidebar-profile-trigger').click()
  const last = page.getByLabel('Nom', { exact: true })
  const first = page.getByLabel('Prénom', { exact: true })
  await expect(last).toHaveAttribute('readonly')
  await expect(first).toHaveAttribute('readonly')
  const before = await last.inputValue()
  await last.focus()
  await page.keyboard.type('accident')
  await expect(last).toHaveValue(before)
  await page.getByRole('button', { name: 'Déverrouiller le nom', exact: true }).click()
  await last.fill('Test')
  await page.getByRole('button', { name: 'Verrouiller le nom', exact: true }).click()
  await expect(last).toHaveAttribute('readonly')
  await page.getByRole('button', { name: 'Déverrouiller le prénom', exact: true }).click()
  await first.fill('Nouveau')
  await last.focus()
  await expect(first).toHaveAttribute('readonly')
  await expect(page.locator('.settings-avatar-preview')).toContainText('NT')
  await expect.poll(async () => (await pool.query('SELECT profile FROM user_state WHERE user_id=$1', [userId])).rows[0]?.profile?.firstName, { timeout: 20000 }).toBe('Nouveau')
  await page.locator('.settings-profile-editor').screenshot({ path: '/tmp/itemstracker-settings-profile-locked-desktop.png' })
  await page.reload()
  await page.locator('.sidebar-profile-trigger').click()
  await expect(last).toHaveValue('Test')
  await expect(first).toHaveValue('Nouveau')
  await expect(first).toHaveAttribute('readonly')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  await page.getByRole('button', { name: 'Déverrouiller le nom', exact: true }).click()
  await expect(last).not.toHaveAttribute('readonly')
  await page.getByRole('button', { name: 'Verrouiller le nom', exact: true }).click()
  await expect(last).toHaveAttribute('readonly')
  console.log('Profile fields: locked by default, typing ignored, unlock/edit/relock, relock on blur, real save/reload, mobile dark and initials passed.')
} finally {
  await browser?.close()
  if (userId) await pool.query('DELETE FROM users WHERE id=$1', [userId])
  await pool.end()
}
