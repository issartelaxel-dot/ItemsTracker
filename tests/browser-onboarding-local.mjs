import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import argon2 from 'argon2'
import pg from 'pg'

const url = 'http://127.0.0.1:5173/itemstracker/onboarding-preview.html'
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:local-preview-only@127.0.0.1:55432/postgres' })
const email = `onboarding-browser-${Date.now()}@local.test`
const password = 'Browser-Onboarding-2026!'
assert.equal((await fetch('http://127.0.0.1:8787/api/onboarding/resources', { headers: { 'x-client-version': '0.1.1' } })).status, 401)
const hash = await argon2.hash(password)
const inserted = await pool.query('INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,$2,$3,$4) RETURNING id',
  [email, 'Browser Test', hash, new Date().toISOString()])
await pool.query('INSERT INTO academic_profiles(user_id,year_code,legacy_exempt) VALUES($1,NULL,FALSE)', [inserted.rows[0].id])
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const issues = []
let releaseResources = () => {}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  page.on('pageerror', error => issues.push(error.message))
  await page.goto(url)
  await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(email)
  await page.getByRole('textbox', { name: 'Mot de passe' }).fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.getByRole('heading', { name: 'Personnalisons ton espace de révision' }).waitFor()
  await page.screenshot({ path: '/tmp/itemstracker-onboarding-desktop-local.png', fullPage: true })
  const mobileOnboarding = await browser.newPage({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  await mobileOnboarding.goto(url)
  await mobileOnboarding.getByRole('textbox', { name: 'Adresse e-mail' }).fill(email)
  await mobileOnboarding.getByRole('textbox', { name: 'Mot de passe' }).fill(password)
  await mobileOnboarding.getByRole('button', { name: 'Se connecter' }).click()
  await mobileOnboarding.getByRole('heading', { name: 'En quelle année de médecine es-tu ?' }).waitFor()
  for (const width of [360, 375, 390, 430, 768]) {
    await mobileOnboarding.setViewportSize({ width, height: 740 })
    assert.equal(await mobileOnboarding.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `overflow at ${width}px`)
  }
  await mobileOnboarding.setViewportSize({ width: 360, height: 740 })
  await mobileOnboarding.screenshot({ path: '/tmp/itemstracker-onboarding-mobile-local.png', fullPage: true })
  await mobileOnboarding.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  await mobileOnboarding.waitForTimeout(250)
  assert.equal(await mobileOnboarding.locator('.academic-year').first().evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(3, 23, 63)')
  await mobileOnboarding.screenshot({ path: '/tmp/itemstracker-onboarding-mobile-dark-local.png', fullPage: true })
  await mobileOnboarding.close()
  // Exercise all three rollout states before completing the first-time flow.
  await page.getByLabel('4e année').check()
  assert.equal(await page.locator('.academic-year').count(), 3)
  for (const yearCode of ['Y2', 'Y3']) {
    const rejected = await page.request.post('http://127.0.0.1:5173/api/onboarding/complete', {
      headers: { 'x-client-version': '0.1.1' }, data: { yearCode, facultyId: 'bordeaux' },
    })
    assert.equal(rejected.status(), 400, `${yearCode} cannot be selected through the API`)
  }
  const selection = page.getByRole('combobox')
  await selection.fill('bordeaux')
  await page.getByRole('option', { name: /Bordeaux/ }).click()
  await page.getByText('Statut pour ton année · 2026–2027', { exact: true }).waitFor()
  assert.equal(await page.locator('.academic-access-panel').count(), 0, 'Normal access has no status message panel')
  assert.equal(await page.locator('.academic-info').count(), 0, 'Normal access has no why-information panel')
  assert.equal(await page.getByRole('button', { name: 'Afficher mes ressources' }).isEnabled(), true)
  await selection.fill('amiens')
  await page.getByRole('option', { name: /Amiens/ }).click()
  await page.locator('.academic-access-panel.is-unconfirmed').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Afficher mes ressources' }).isEnabled(), false)
  await page.getByRole('checkbox', { name: /Je comprends/ }).check()
  assert.equal(await page.getByRole('button', { name: 'Afficher mes ressources' }).isEnabled(), true)
  await selection.fill('val-de')
  await page.getByRole('option', { name: /Val-de-Grâce/ }).click()
  await page.locator('.academic-access-panel.is-missing').waitFor()
  assert.equal(await page.locator('button[type=submit]').count(), 0, 'Red programmes cannot continue to the dashboard')
  await page.getByRole('button', { name: 'Demander la disponibilité' }).click()
  await page.getByLabel('Message facultatif').fill('Programme demandé pour mon année.')
  await page.getByRole('button', { name: 'Enregistrer ma demande' }).click()
  await page.getByText('Ta demande a été enregistrée', { exact: false }).waitFor()
  const denied = await page.request.post('http://127.0.0.1:5173/api/onboarding/complete', {
    headers: { 'x-client-version': '0.1.1' }, data: { yearCode: 'Y4', facultyId: 'val-de-grace' },
  })
  assert.equal(denied.status(), 409, 'Server also refuses red onboarding completion')
  const inquiry = await pool.query('SELECT faculty_id,year_code,academic_term,message FROM academic_availability_requests WHERE user_id=$1', [inserted.rows[0].id])
  assert.deepEqual(inquiry.rows, [{ faculty_id: 'val-de-grace', year_code: 'Y4', academic_term: '2026-2027', message: 'Programme demandé pour mon année.' }])
  for (const width of [360, 375, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `rollout overflow at ${width}`)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/tmp/itemstracker-onboarding-access-mobile.png', fullPage: true })
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.academic-year').last().evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(3, 23, 63)')
  await page.screenshot({ path: '/tmp/itemstracker-onboarding-access-mobile-dark.png', fullPage: true })
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByLabel('5e année').check()
  const faculty = page.getByRole('combobox')
  await faculty.fill('rennes')
  await page.getByRole('option', { name: /Rennes/ }).click()
  if (await page.getByRole('checkbox', { name: /Je comprends/ }).count()) await page.getByRole('checkbox', { name: /Je comprends/ }).check()
  await page.route('**/api/onboarding/complete', route => route.fulfill({ status: 400,
    contentType: 'application/json', body: JSON.stringify({ error: 'Échec temporaire de préparation. Réessaie.' }) }), { times: 1 })
  await page.getByRole('button', { name: 'Afficher mes ressources' }).click()
  await page.locator('.academic-error').waitFor()
  assert.equal(await faculty.inputValue(), 'Rennes', 'Preparation failure preserves the selection')
  const preparationStartedAt = Date.now()
  const resourcesGate = new Promise(resolve => { releaseResources = resolve })
  await page.route(/\/api\/onboarding\/resources(?:\?|$)/, async route => { await resourcesGate; await route.continue() })
  await page.getByRole('button', { name: 'Afficher mes ressources' }).click()
  await page.getByRole('heading', { name: 'Préparation de ton espace' }).waitFor()
  await page.locator('.onboarding-preparation-steps li.is-current').filter({ hasText: /Items et collèges disponibles|UE locales disponibles/ }).waitFor()
  assert.equal(await page.locator('.onboarding-preparation-steps li.is-done').count(), 1)
  await page.screenshot({ path: '/tmp/itemstracker-onboarding-preparation-desktop.png', fullPage: true })
  for (const width of [360, 375, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `preparation overflow at ${width}`)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/tmp/itemstracker-onboarding-preparation-mobile.png', fullPage: true })
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  await page.waitForTimeout(250)
  await page.screenshot({ path: '/tmp/itemstracker-onboarding-preparation-mobile-dark.png', fullPage: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await page.locator('.onboarding-art-sheet.is-front').evaluate(element => getComputedStyle(element).animationName), 'none')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.locator('.onboarding-preparation-art').evaluate(element => element.dataset.continuityCheck = 'same-screen')
  releaseResources()
  await page.getByRole('heading', { name: 'Ton espace est prêt' }).waitFor()
  assert.ok(Date.now() - preparationStartedAt >= 3900, 'The visual preparation lasts at least four seconds')
  assert.equal(await page.locator('.onboarding-preparation-art').getAttribute('data-continuity-check'), 'same-screen', 'The same illustration remains mounted after loading')
  assert.equal(await page.locator('.onboarding-preparation-steps li.is-done').count(), 3)
  await page.getByRole('button', { name: 'Accéder au dashboard' }).waitFor()
  const transitionMode = process.env.ONBOARDING_TRANSITION_MODE || 'native'
  if (transitionMode === 'fallback') await page.evaluate(() => { Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined }) })
  if (transitionMode === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Accéder au dashboard' }).click()
  await page.getByRole('heading', { name: /Bonjour/ }).waitFor()
  await page.waitForFunction(() => !document.documentElement.classList.contains('onboarding-dashboard-transition') &&
    !document.querySelector('.onboarding-page') && !document.querySelector('.dashboard-layout')?.getAnimations().some(animation => animation.playState === 'running'))
  assert.equal(await page.locator('.dashboard-layout').count(), 1)

  await page.reload()
  await page.getByRole('heading', { name: /Bonjour/ }).waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Personnalisons ton espace de révision' }).count(), 0)
  await page.locator('.sidebar-nav-item').filter({ hasText: 'Items' }).click()
  await page.locator('#items-section').waitFor()
  await page.locator('.sidebar-profile-trigger').click()
  await page.getByRole('button', { name: 'Modifier mon parcours', exact: true }).click()
  await page.getByRole('heading', { name: 'Mon parcours de médecine' }).waitFor()
  await page.getByLabel('6e année').check()
  await page.getByRole('checkbox', { name: /Je comprends/ }).check()
  await page.getByRole('button', { name: 'Vérifier les modifications' }).click()
  await page.getByRole('button', { name: 'Confirmer le changement' }).click()
  await page.getByRole('button', { name: 'Oui, modifier mon parcours', exact: true }).click()
  let state
  for (let attempt = 0; attempt < 50; attempt++) {
    state = await pool.query('SELECT year_code,faculty_id FROM academic_profiles WHERE user_id=$1', [inserted.rows[0].id])
    if (state.rows[0]?.year_code === 'Y6') break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.equal(state.rows[0].year_code, 'Y6')
  assert.equal(state.rows[0].faculty_id, 'rennes')
  await page.locator('.sidebar-nav-item').filter({ hasText: 'Items' }).click()
  await page.locator('#items-section').waitFor()
  const mobile = await browser.newPage({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  mobile.on('pageerror', error => issues.push(error.message))
  await mobile.goto(url)
  await mobile.getByRole('textbox', { name: 'Adresse e-mail' }).fill(email)
  await mobile.getByRole('textbox', { name: 'Mot de passe' }).fill(password)
  await mobile.getByRole('button', { name: 'Se connecter' }).click()
  await mobile.getByRole('heading', { name: /Bonjour/ }).waitFor()
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  assert.equal(overflow, false, 'mobile horizontal overflow')
  assert.deepEqual(issues, [])
  console.log(`Browser onboarding: desktop, completion, ${transitionMode} dashboard transition, reload, settings, mobile: OK`)
} finally {
  releaseResources()
  await browser.close()
  await pool.query('DELETE FROM users WHERE id=$1', [inserted.rows[0].id])
  await pool.end()
}
