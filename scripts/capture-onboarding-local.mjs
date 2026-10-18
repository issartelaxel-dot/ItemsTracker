import { chromium } from '@playwright/test'
import pg from 'pg'
import argon2 from 'argon2'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const base = 'http://127.0.0.1:5173'
const output = path.resolve('docs/onboarding-screenshots-2026-10-15')
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:local-preview-only@127.0.0.1:55432/postgres' })
const email = `captures-${Date.now()}@local.test`
const password = 'Screenshots-Local-2026!'
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
let userId
const captures = []
const variants = [
  { id: 'mobile-clair', width: 390, height: 844, theme: 'light', label: 'Téléphone · clair' },
  { id: 'mobile-sombre', width: 390, height: 844, theme: 'dark', label: 'Téléphone · sombre' },
  { id: 'desktop-clair', width: 1440, height: 1000, theme: 'light', label: 'PC · clair' },
  { id: 'desktop-sombre', width: 1440, height: 1000, theme: 'dark', label: 'PC · sombre' },
]
try {
  const inserted = await pool.query('INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,$2,$3,$4) RETURNING id', [email, 'Camille', await argon2.hash(password), new Date().toISOString()])
  userId = inserted.rows[0].id
  await pool.query('INSERT INTO academic_profiles(user_id,legacy_exempt) VALUES($1,FALSE)', [userId])
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  async function capture(id, title, note = '') {
    const images = []
    for (const variant of variants) {
      await mkdir(path.join(output, variant.id), { recursive: true })
      await page.setViewportSize({ width: variant.width, height: variant.height })
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; window.scrollTo({ top: 0, behavior: 'instant' }) }, variant.theme)
      const file = `${variant.id}/${id}.png`
      await page.screenshot({ path: path.join(output, file), fullPage: !/^1[0-4]-/.test(id), animations: 'disabled' })
      images.push({ variant: variant.id, file })
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })
    captures.push({ id, title, note, images })
    console.log(`Captured ${id}: ${title}`)
  }
  await page.goto(`${base}/itemstracker/onboarding-preview.html`)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).waitFor()
  await capture('01-connexion', 'Connexion', 'Point d’entrée avant le parcours. Le compte utilisé pour les captures est temporaire.')
  await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(email)
  await page.getByRole('textbox', { name: 'Mot de passe' }).fill(password)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await page.getByRole('heading', { name: 'En quelle année de médecine es-tu ?' }).waitFor()
  await capture('02-choix-parcours', 'Choix du parcours', 'Année et faculté figurent actuellement sur le même écran.')
  await page.getByLabel('4e année').check()
  await page.getByRole('combobox').fill('')
  await page.getByRole('option', { name: /Bordeaux/ }).waitFor()
  await capture('03-liste-facultes', 'Choix de la faculté', 'Les statuts dépendent de l’année sélectionnée.')
  await page.getByRole('option', { name: /Bordeaux/ }).click()
  await page.locator('.academic-access-panel.is-verified').waitFor()
  await capture('04-acces-normal', 'Faculté verte — accès normal')
  await page.getByRole('combobox').fill('amiens')
  await page.getByRole('option', { name: /Amiens/ }).click()
  await page.locator('.academic-access-panel.is-unconfirmed').waitFor()
  await capture('05-acces-beta', 'Faculté orange — accès bêta', 'La confirmation de vérification personnelle est obligatoire.')
  await page.getByRole('checkbox', { name: /Je comprends/ }).check()
  await capture('06-beta-confirmee', 'Accès bêta confirmé')
  await page.getByRole('combobox').fill('val-de')
  await page.getByRole('option', { name: /Val-de-Grâce/ }).click()
  await page.locator('.academic-access-panel.is-missing').waitFor()
  await capture('07-bientot-disponible', 'Faculté rouge — bientôt disponible', 'Aucun accès au tronc commun et aucun bouton pour terminer ce parcours.')
  await page.getByRole('button', { name: 'Demander la disponibilité' }).click()
  await page.getByLabel('Message facultatif').fill('Bonjour, je souhaite accéder au programme de 4e année de ma faculté pour 2026–2027.')
  await capture('08-demande', 'Demande de disponibilité', 'Le message est facultatif.')
  await page.getByRole('button', { name: 'Enregistrer ma demande' }).click()
  await page.getByText('Ta demande a été enregistrée', { exact: false }).waitFor()
  await capture('09-demande-enregistree', 'Demande enregistrée', 'Cette branche reste bloquée ; la suite ci-dessous utilise Bordeaux.')
  await page.getByRole('combobox').fill('bordeaux')
  await page.getByRole('option', { name: /Bordeaux/ }).click()
  await page.locator('.academic-access-panel.is-verified').waitFor()
  // Freeze the browser clock to capture each real presentation milestone.
  await page.clock.install()
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  await page.getByRole('button', { name: 'Afficher mes ressources' }).click()
  await page.getByRole('heading', { name: 'Préparation de ton espace' }).waitFor()
  await capture('10-preparation-parcours', 'Préparation — étape 1 : parcours')
  await page.clock.runFor(1250)
  await page.locator('.onboarding-preparation-steps li.is-current').filter({ hasText: 'Items et collèges disponibles' }).waitFor()
  await capture('11-preparation-ressources', 'Préparation — étape 2 : ressources')
  await page.clock.runFor(1200)
  await page.locator('.onboarding-preparation-steps li.is-current').filter({ hasText: 'Associations et espace personnel' }).waitFor()
  await capture('12-preparation-associations', 'Préparation — étape 3 : associations')
  await page.clock.runFor(1200)
  await page.locator('.onboarding-preparation-steps li.is-done').nth(2).waitFor()
  await capture('13-preparation-terminee', 'Préparation terminée')
  await page.clock.runFor(500)
  await page.getByRole('heading', { name: 'Ton espace est prêt' }).waitFor()
  await capture('14-espace-pret', 'Ton espace est prêt')
  await page.getByRole('button', { name: 'Accéder au dashboard' }).click()
  await page.getByRole('heading', { name: /Bonjour/ }).waitFor()
  await page.clock.runFor(600)
  await capture('15-dashboard', 'Arrivée sur le dashboard')
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ capturedAt: '2026-10-15', variants, captures }, null, 2))
  const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
  await writeFile(path.join(output, 'index.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ItemsTracker — captures onboarding</title><style>body{margin:0;background:#f3f6f8;color:#172531;font:15px/1.6 system-ui}main{max-width:1500px;margin:auto;padding:24px}h1{font-size:28px;margin:0}header{margin-bottom:24px}nav{display:flex;gap:10px;flex-wrap:wrap;position:sticky;top:0;background:#f3f6f8ed;padding:12px 0;z-index:1}button{border:1px solid #cbd9eb;border-radius:9px;background:white;padding:10px 15px;color:#1765ed;cursor:pointer}button[aria-pressed=true]{background:#1765ed;color:white}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}article{background:#fff;padding:18px;border:1px solid #d3dee7;border-radius:16px;min-width:0}h2{font-size:17px;margin:0 0 10px}p{color:#5f7386}img{width:100%;height:auto;border:1px solid #e5edf5;box-sizing:border-box;display:block;border-radius:10px}a{color:#1765ed}.variant[hidden]{display:none}</style><main><header><h1>ItemsTracker · Onboarding</h1><p>15 étapes et états réels de la version locale · 15 octobre 2026.<br>Les branches verte, orange et rouge sont présentées séparément. La préparation est capturée avec l’horloge du navigateur contrôlée pour montrer chaque étape. Aucun changement de production.</p></header><nav>${variants.map((v, i) => `<button data-variant="${v.id}" aria-pressed="${i === 0}">${v.label}</button>`).join('')}</nav><div class="grid">${captures.map(c => `<article><h2>${escape(c.title)}</h2>${c.note ? `<p>${escape(c.note)}</p>` : ''}${c.images.map((im, i) => `<a class="variant" data-kind="${im.variant}" href="${im.file}" ${i ? 'hidden' : ''}><img src="${im.file}" alt="${escape(c.title)} — ${variants[i].label}" loading="lazy"></a>`).join('')}</article>`).join('')}</div></main><script>document.querySelectorAll('button[data-variant]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('button[data-variant]').forEach(x=>x.setAttribute('aria-pressed',x===b));document.querySelectorAll('.variant').forEach(x=>x.hidden=x.dataset.kind!==b.dataset.variant)}))</script></html>`)
  console.log(`Done: ${captures.length * variants.length} screenshots and gallery in ${output}`)
} finally {
  await browser.close()
  if (userId) await pool.query('DELETE FROM users WHERE id=$1', [userId])
  await pool.end()
}
