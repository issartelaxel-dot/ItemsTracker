import pg from 'pg'
import argon2 from 'argon2'
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:local-preview-only@127.0.0.1:55432/postgres' })
let userId, browser
try {
  const email = `avatar-modes-${Date.now()}@local.test`, password = 'Avatar-Local-2026!'
  userId = (await pool.query('INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,$2,$3,NOW()) RETURNING id', [email, 'Test Avatar', await argon2.hash(password)])).rows[0].id
  await pool.query("INSERT INTO academic_profiles(user_id,year_code,faculty_id,legacy_exempt,completed_at) VALUES($1,'Y4','bordeaux',false,NOW())", [userId])
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:5173/itemstracker/onboarding-preview.html')
  await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(email)
  await page.getByRole('textbox', { name: 'Mot de passe' }).fill(password)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  const settings = async () => page.locator('.sidebar-profile-trigger').click()
  await settings()
  const editor = page.locator('.settings-avatar-editor'), preview = editor.locator('.settings-avatar-preview')
  await editor.getByRole('button', { name: 'Initiales', exact: true }).click()
  await expect(preview).toContainText('TA')
  await editor.getByRole('button', { name: 'Personnalisé', exact: true }).click()
  await editor.getByLabel('Initiales personnalisées', { exact: true }).fill('xyzq')
  await expect(preview).toContainText('XYZ')
  const savedProfile = async () => (await pool.query('SELECT profile FROM user_state WHERE user_id=$1', [userId])).rows[0]?.profile
  await expect.poll(async () => (await savedProfile())?.avatarCustomInitials, { timeout: 20000 }).toBe('XYZ')
  await page.reload(); await settings()
  await expect(preview).toContainText('XYZ')
  await editor.getByRole('button', { name: 'Initiales', exact: true }).click()
  await editor.getByRole('button', { name: 'Smiley', exact: true }).click()
  await editor.getByRole('button', { name: 'Smiley 😎', exact: true }).click()
  await expect(preview).toContainText('😎')
  await expect.poll(async () => (await savedProfile())?.avatarEmoji, { timeout: 20000 }).toBe('😎')
  await page.reload(); await settings(); await expect(preview).toContainText('😎')
  await editor.getByRole('button', { name: 'Image', exact: true }).click()
  await expect(editor.locator('.settings-avatar-colors')).toBeHidden()
  await expect(editor.locator('.settings-avatar-dropzone')).toBeVisible()
  const transfer = await page.evaluateHandle(() => {
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='), c => c.charCodeAt(0))
    const data = new DataTransfer(); data.items.add(new File([bytes], 'avatar.png', { type: 'image/png' })); return data
  })
  await editor.locator('.settings-avatar-dropzone').dispatchEvent('drop', { dataTransfer: transfer })
  await expect(preview.locator('img')).toBeVisible()
  await editor.getByRole('button', { name: 'Initiales', exact: true }).click()
  await editor.getByRole('button', { name: 'Automatique', exact: true }).click()
  await expect(preview).toContainText('TA')
  await expect(preview.locator('img')).toHaveCount(0)
  // Compare positions relative to the editor so browser scrolling cannot hide a layout jump.
  for (const width of [1440, 1100, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 })
    const geometry = () => editor.evaluate(element => {
      const base = element.getBoundingClientRect()
      return ['.settings-avatar-preview', 'h3', '.settings-avatar-actions'].flatMap(selector => {
        const box = element.querySelector(selector).getBoundingClientRect()
        return [box.x - base.x, box.y - base.y]
      })
    })
    const before = await geometry()
    for (const mode of ['Couleur', 'Image', 'Initiales']) {
      await editor.getByRole('button', { name: mode, exact: true }).click()
      if (mode === 'Initiales') {
        for (const kind of ['Automatique', 'Personnalisé', 'Smiley']) {
          await editor.getByRole('button', { name: kind, exact: true }).click()
          const after = await geometry()
          assert.ok(after.every((value, i) => Math.abs(value - before[i]) < 1), `${width}: stable geometry for ${kind}: ${before} => ${after}`)
        }
      }
      await page.waitForTimeout(220)
      const sizes = await editor.locator('.settings-avatar-mode').evaluate(element => ({
        height: parseFloat(getComputedStyle(element).height),
        content: element.querySelector('[data-active="true"]').getBoundingClientRect().height,
      }))
      assert.ok(Math.abs(sizes.height - sizes.content) < 1, `${width} ${mode}: no reserved empty space`)
      const after = await geometry()
      assert.ok(after.every((value, i) => Math.abs(value - before[i]) < 1), `${width}: stable geometry for ${mode}: ${before} => ${after}`)
    }
  }
  for (const mode of ['Image', 'Initiales']) {
    await editor.getByRole('button', { name: mode, exact: true }).click()
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme)
      for (const width of [1440, 768, 390, 360]) {
        await page.setViewportSize({ width, height: 1000 })
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${mode} ${theme} ${width} fits`)
        if (width === 390 || width === 1440) await editor.screenshot({ path: `/tmp/itemstracker-avatar-${mode}-${theme}-${width}.png` })
      }
    }
  }
  assert.deepEqual(errors, [])
  console.log('Avatar: separate modes, automatic/custom/smiley, character limit, save/reload, real drag/drop, photo removal, light/dark desktop/mobile: OK')
} finally {
  await browser?.close()
  if (userId) await pool.query('DELETE FROM users WHERE id=$1', [userId])
  await pool.end()
}
