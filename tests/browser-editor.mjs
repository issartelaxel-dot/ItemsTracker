// Editing regression checks against mocked storage: no production data or email.
import assert from 'node:assert/strict'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { chromium, webkit, expect } from '@playwright/test'
import { mergePatch } from '../server/state-model.mjs'

const socket = net.createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const base = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' })

async function paste(editor, text) {
  await editor.evaluate((root, value) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', value)
    root.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  }, text)
}

async function clear(editor) {
  await editor.focus()
  await editor.press('ControlOrMeta+a')
  await editor.press('Backspace')
  await expect(editor).toHaveText('')
}

async function setup(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 })
  const page = await context.newPage(), errors = [], writes = []
  page.on('pageerror', error => errors.push(error.message))
  let state = {
    trackingState: { items: { 1: { assignedColleges: ['Médecine Interne'], quiz: { enabled: true, activeCardId: 'editor-1', cards: [1, 2].map(i => ({
      id: `editor-${i}`, question: `<div>Question ${i}</div>`,
      answer: '<div><span style="color: rgb(36, 83, 163)">Couleur</span> <span class="quiz-rich-highlight-text">Surligné</span> <strong>Gras</strong> <em>Italique</em></div>',
      quizCount: 0, lastReviewedAt: null, lastResult: null,
    })) } } } }, theme: 'light', focusMode: false, dateFormat: 'fr-short', timeZone: 'auto', youtubeDisplayMode: 'embed', shuffleQuizCards: false,
    profile: { firstName: 'Test', lastName: 'Editor', email: 'editor@example.test', photoUrl: '', password: '', avatarGradient: 'red' },
  }, version = 1
  await context.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    const headers = { 'content-type': 'application/json', 'x-app-version': '0.1.0', 'access-control-allow-origin': base, 'access-control-allow-credentials': 'true', 'access-control-expose-headers': 'x-app-version', 'access-control-allow-headers': 'content-type,authorization,x-client-version', 'access-control-allow-methods': 'GET,PUT,PATCH,POST' }
    const answer = body => route.fulfill({ headers, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/api/auth/me') return answer({ user: { id: 989, email: 'editor@example.test', displayName: 'Test Editor' }, token: 'test-token' })
    if (path === '/api/state' && req.method() === 'GET') return answer({ state: { ...state, updatedAt: new Date().toISOString() }, version, imageVersions: {} })
    if (path === '/api/state' && ['PATCH', 'PUT'].includes(req.method())) {
      const body = req.postDataJSON()
      writes.push(body)
      // Exercise editing while an earlier cloud save is still in flight.
      await new Promise(resolve => setTimeout(resolve, 450))
      state = req.method() === 'PATCH' ? mergePatch(state, body.patch) : body
      return answer({ ok: true, version: ++version, updatedAt: new Date().toISOString() })
    }
    return answer({ ok: true, preview: null, version })
  })
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' || route.request().url().includes('/api/') ? route.fallback() : route.abort())
  await page.goto(base + '/itemstracker/app.html')
  await expect(page.locator('.dashboard-home')).toBeVisible({ timeout: 20000 })
  const nav = page.locator(width < 768 ? '.mobile-bottom-nav' : '.dashboard-sidebar')
  await nav.getByRole('button', { name: 'Items', exact: true }).click()
  await page.locator('.items-list-row').first().click()
  await page.locator('.item-detail-tabs').getByRole('button', { name: 'Flashcards', exact: true }).click()
  const open = async () => { await page.locator('.quiz-card-edit').first().click(); await expect(page.locator('.quiz-rich-editable')).toBeVisible() }
  await open()
  return { context, page, errors, writes, open, getCards: () => state.trackingState.items['1'].quiz.cards }
}

try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/itemstracker/app.html')).ok) break } catch {}
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  for (const [name, engine] of [['chrome', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch({ headless: true, ...(name === 'chrome' && process.platform === 'darwin' ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {}) })
    try {
      for (const width of [390, 1440]) {
        const t = await setup(browser, width), { page } = t
        const editor = page.locator('.quiz-rich-editable'), modal = page.locator('.flashcard-editor-modal')
        const side = label => modal.locator('.flashcard-editor-tabs').getByRole('button', { name: label, exact: true })
        // Switch without waiting for a debounce or even a blur event.
        await editor.fill('Derniers caractères sans rollback')
        await side('Verso').evaluate(button => button.click())
        await side('Recto').evaluate(button => button.click())
        await expect(editor).toHaveText('Derniers caractères sans rollback')

        await side('Verso').click()
        const styles = await editor.evaluate(root => {
          const find = word => [...root.querySelectorAll('span')].find(el => el.textContent === word)
          return { color: find('Couleur')?.style.color, highlight: find('Surligné')?.style.backgroundColor }
        })
        assert.equal(styles.color, 'rgb(36, 83, 163)', 'Existing text color must survive importing')
        assert.equal(styles.highlight, 'rgb(255, 245, 157)', 'Existing highlight must survive importing')
        await side('Recto').click()

        // A toolbar action must preserve the exact selected text and work by keyboard.
        await editor.fill('Sélection stable')
        await editor.press('ControlOrMeta+a')
        const bold = modal.getByRole('button', { name: 'Gras', exact: true })
        if (width < 768) await bold.tap()
        else await bold.click()
        await expect(editor.locator('strong')).toHaveText('Sélection stable')
        const blue = modal.getByRole('button', { name: 'Bleu', exact: true })
        await blue.focus()
        await page.keyboard.press('Enter')
        await expect.poll(() => editor.locator('*').evaluateAll(els => els.some(el => el.style.color === 'rgb(36, 83, 163)'))).toBe(true)
        await modal.getByRole('button', { name: 'Surligner', exact: true }).click()
        await expect.poll(() => editor.locator('*').evaluateAll(els => els.some(el => el.style.backgroundColor === 'rgb(255, 245, 157)'))).toBe(true)
        await side('Verso').click()
        await side('Recto').click()
        await expect(editor.locator('strong')).toHaveText('Sélection stable')
        assert.ok(await editor.locator('*').evaluateAll(els => els.some(el => el.style.color === 'rgb(36, 83, 163)' && el.style.backgroundColor === 'rgb(255, 245, 157)')))

        await editor.fill('Raccourci unique')
        await editor.press('ControlOrMeta+a')
        // A single shortcut must not toggle twice and silently cancel itself.
        // Start with plain text regardless of inherited typing format.
        const initiallyBold = await editor.locator('strong').count() > 0
        await editor.press('ControlOrMeta+b')
        await expect.poll(async () => await editor.locator('strong').count() > 0).toBe(!initiallyBold)
        await editor.press('ControlOrMeta+b')
        await expect.poll(async () => await editor.locator('strong').count() > 0).toBe(initiallyBold)

        await editor.fill('Alpha Beta Gamma')
        await editor.press('ControlOrMeta+a')
        await editor.press('ArrowLeft')
        for (let i = 0; i < 5; i++) await editor.press('Shift+ArrowRight')
        await modal.getByRole('button', { name: 'Rouge', exact: true }).click()
        const colored = await editor.locator('*').evaluateAll(els => els.filter(el => el.style.color === 'rgb(210, 71, 71)').map(el => el.textContent))
        assert.deepEqual(colored, ['Alpha'], 'Formatting must affect only the selected word')

        // Caret editing and one-step undo/redo through shortcuts and buttons.
        await editor.fill('Texte fluide')
        await page.waitForTimeout(1100) // A separate native undo group from replacing the entire text.
        await editor.press('End')
        await editor.press('ArrowLeft')
        await page.keyboard.insertText('!')
        await expect(editor).toHaveText('Texte fluid!e')
        await editor.press('ControlOrMeta+z')
        await expect(editor).toHaveText('Texte fluide')
        await editor.press('ControlOrMeta+Shift+z')
        await expect(editor).toHaveText('Texte fluid!e')
        await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
        await expect(editor).toHaveText('Texte fluide')
        await modal.getByRole('button', { name: 'Rétablir', exact: true }).click()
        await expect(editor).toHaveText('Texte fluid!e')

        await editor.fill('Première ligne')
        await editor.press('ControlOrMeta+a')
        await modal.getByRole('button', { name: 'Puces', exact: true }).click()
        await expect(editor.locator('li')).toHaveCount(1)
        await editor.press('ArrowRight')
        await editor.press('Enter')
        await page.keyboard.insertText('Deuxième ligne')
        await expect(editor.locator('li')).toHaveCount(2)
        await side('Verso').evaluate(button => button.click())
        await side('Recto').evaluate(button => button.click())
        await expect(editor.locator('li')).toHaveCount(2)

        // Long paste is truncated once; replacing a selection at the limit works.
        await clear(editor)
        await paste(editor, 'x'.repeat(520))
        await expect(editor).toHaveText('x'.repeat(500))
        await editor.press('ArrowRight')
        await editor.pressSequentially('z')
        await expect(editor).toHaveText('x'.repeat(500))
        await editor.press('ControlOrMeta+a')
        await paste(editor, 'Accents éèà et remplacement')
        await expect(editor).toHaveText('Accents éèà et remplacement')

        await clear(editor)
        const typed = 'Saisie rapide et stable avec un curseur intact.'
        await editor.pressSequentially(typed, { delay: 0 })
        await expect(editor).toHaveText(typed)

        await editor.fill('Copie sans perdre les derniers caractères')
        if (width < 768) await modal.getByRole('button', { name: 'Actions de la flashcard' }).click()
        await modal.getByRole('button', { name: 'Dupliquer', exact: true }).evaluate(button => button.click())
        await expect(editor).toHaveText('Copie sans perdre les derniers caractères')
        if (width < 768) await modal.getByRole('button', { name: 'Actions de la flashcard' }).click()
        await modal.getByRole('button', { name: 'Précédente', exact: true }).click()
        await expect(editor).toHaveText('Copie sans perdre les derniers caractères')

        await editor.fill('Fermeture sans perte')
        // Escape is an independent close path without a pointer or blur.
        if (width < 768) await page.keyboard.press('Escape')
        else await modal.getByRole('button', { name: 'Fermer', exact: true }).evaluate(button => button.click())
        await t.open()
        await expect(editor).toHaveText('Fermeture sans perte')

        // Verify a final edit is persisted even when an earlier response arrives later.
        await editor.fill('Premier enregistrement')
        await expect.poll(() => t.writes.some(body => JSON.stringify(body).includes('Premier enregistrement')), { timeout: 10000 }).toBe(true)
        await editor.fill('Version finale conservée')
        await expect.poll(() => t.getCards()[0].question, { timeout: 10000 }).toContain('Version finale conservée')
        await page.reload()
        await expect(page.locator('.dashboard-home')).toBeVisible()
        const nav = page.locator(width < 768 ? '.mobile-bottom-nav' : '.dashboard-sidebar')
        await nav.getByRole('button', { name: 'Items', exact: true }).click()
        await page.locator('.items-list-row').first().click()
        await page.locator('.item-detail-tabs').getByRole('button', { name: 'Flashcards', exact: true }).click()
        await t.open()
        await expect(editor).toHaveText('Version finale conservée')

        if (width < 768) await page.keyboard.press('Escape')
        else await modal.getByRole('button', { name: 'Fermer', exact: true }).click()
        await nav.getByRole('button', { name: 'Dashboard', exact: true }).click()
        await page.getByRole('button', { name: 'Créer des flashcards', exact: false }).click()
        const creator = page.locator('.flash-create-modal')
        await creator.getByPlaceholder('Rechercher un item par numéro, titre ou collège...').fill('relation médecin-malade')
        await creator.locator('.flash-create-item-result').first().click()
        await creator.locator('.quiz-rich-editable').nth(0).fill('Question créée immédiatement')
        await creator.locator('.quiz-rich-editable').nth(1).fill('Réponse créée immédiatement')
        await creator.getByRole('button', { name: 'Créer la flashcard', exact: true }).evaluate(button => button.click())
        await expect(creator).toHaveCount(0)
        await expect.poll(() => t.getCards().find(card => card.question.includes('Question créée immédiatement'))?.answer, { timeout: 10000 }).toContain('Réponse créée immédiatement')
        assert.deepEqual(t.errors, [])
        console.log(`${name} ${width}: rapid face change / formatting / keyboard toolbar / single shortcuts / caret / undo-redo / lists / paste limit / fast typing / duplication / close / delayed cloud save / reload / immediate creation PASS`)
        await t.context.close()
      }
    } finally { await browser.close() }
  }
} finally { server.kill('SIGTERM') }
