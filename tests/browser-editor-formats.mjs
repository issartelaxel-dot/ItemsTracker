// Exhaustive formatting combinations, using toolbar controls and mocked storage.
import assert from 'node:assert/strict'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { chromium, webkit, expect } from '@playwright/test'
import { mergePatch } from '../server/state-model.mjs'


const colors = [['Couleur normale', null], ['Rouge', 'rgb(210, 71, 71)'], ['Orange', 'rgb(217, 141, 17)'], ['Vert', 'rgb(0, 137, 90)'], ['Bleu', 'rgb(36, 83, 163)'], ['Violet', 'rgb(109, 63, 199)'], ['Brun', 'rgb(122, 75, 47)']]
const formats = ['Gras', 'Italique', 'Surligner', 'Puces']
const cases = Array.from({ length: 16 }, (_, mask) => colors.map(([color, rgb]) => ({ mask, color, rgb }))).flat()

const socket = net.createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const base = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' })

async function setup(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 })
  const page = await context.newPage(), errors = [], writes = []
  page.on('pageerror', error => errors.push(error.message))
  let state = {
    trackingState: { items: { 1: { assignedColleges: ['Médecine Interne'], quiz: { enabled: true, activeCardId: 'editor-1', cards: Array.from({ length: cases.length }, (_, index) => index + 1).map(i => ({
      id: `editor-${i}`, question: `<div>Cas ${i}</div>`,
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
  const open = async () => { await page.locator('.quiz-card-edit').first().evaluate(button => button.click()); await expect(page.locator('.quiz-rich-editable')).toBeVisible() }
  await open()
  return { context, page, errors, writes, open, getCards: () => state.trackingState.items['1'].quiz.cards }
}

async function readFormatting(root) {
  return root.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const text = []
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (!node.textContent.trim()) continue
      const style = getComputedStyle(node.parentElement)
      let highlighted = false
      for (let parent = node.parentElement; parent && parent !== element; parent = parent.parentElement) {
        if (getComputedStyle(parent).backgroundColor === 'rgb(255, 245, 157)') highlighted = true
      }
      text.push({ bold: Number(style.fontWeight) >= 600 || style.fontWeight === 'bold', italic: style.fontStyle === 'italic', highlighted, list: Boolean(node.parentElement.closest('li')), color: style.color })
    }
    return text
  })
}
async function check(root, spec, label) {
  try { await expect.poll(async () => {
    const actual = await readFormatting(root)
    return actual.length > 0 && actual.every(value =>
      value.bold === Boolean(spec.mask & 1) && value.italic === Boolean(spec.mask & 2) &&
      value.highlighted === Boolean(spec.mask & 4) && value.list === Boolean(spec.mask & 8) &&
      (spec.rgb ? value.color === spec.rgb : !colors.some(([, rgb]) => rgb === value.color)))
  }, { message: label, timeout: 3000 }).toBe(true) } catch (error) {
    console.error(label, { spec, actual: await readFormatting(root), html: await root.innerHTML() })
    throw error
  }
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
        const modal = page.locator('.flashcard-editor-modal'), editor = modal.locator('.quiz-rich-editable')
        const preview = modal.locator('.flashcard-editor-preview-body .quiz-rich-rendered')
        const side = label => modal.locator('.flashcard-editor-tabs').getByRole('button', { name: label, exact: true })
        const click = async label => {
          const button = modal.locator('.quiz-rich-toolbar').getByRole('button', { name: label, exact: true })
          if (width < 768) await button.tap()
          else await button.click()
        }
        const next = async () => {
          if (width < 768) await modal.getByRole('button', { name: 'Actions de la flashcard' }).click()
          await modal.getByRole('button', { name: 'Suivante', exact: true }).click()
        }
        for (const [index, spec] of cases.entries()) {
          await expect(editor).toHaveText(`Cas ${index + 1}`)
          await editor.focus()
          await editor.press('ControlOrMeta+a')
          const actions = [...formats.filter((_, bit) => spec.mask & (1 << bit)), spec.color]
          // Exercise different application orders, including colors before formats.
          const offset = index % actions.length
          const order = [...actions.slice(offset), ...actions.slice(0, offset)]
          for (const action of order) await click(action)
          const label = `${name} ${width}, cas ${index + 1}, ${order.join(' + ')}`
          await check(editor, spec, label + ': editor')
          await check(preview, spec, label + ': preview')
          if (spec.rgb) {
            await click('Couleur normale')
            await check(editor, { ...spec, rgb: null }, label + ': default color preserves other formats')
            await click(spec.color)
            await check(editor, spec, label + ': recolor')
          }
          if (spec.mask === 15) {
            for (let bit = 0; bit < formats.length; bit++) {
              await click(formats[bit])
              await check(editor, { ...spec, mask: spec.mask & ~(1 << bit) }, label + ': remove ' + formats[bit])
              await click(formats[bit])
              await check(editor, spec, label + ': restore ' + formats[bit])
            }
          }
          await side('Verso').evaluate(button => button.click())
          await side('Recto').evaluate(button => button.click())
          await check(editor, spec, label + ': reimport')
          if (index < cases.length - 1) await next()
          if ((index + 1) % 28 === 0) console.log(`${name} ${width}: ${index + 1}/112 combination cases PASS`)
        }
        await expect.poll(() => t.getCards().at(-1).question, { timeout: 10000 }).toContain('Cas 112')
        await expect.poll(() => t.getCards().at(-1).question.includes('rgb(122, 75, 47)'), { timeout: 10000 }).toBe(true)
        await page.reload()
        await expect(page.locator('.dashboard-home')).toBeVisible()
        const nav = page.locator(width < 768 ? '.mobile-bottom-nav' : '.dashboard-sidebar')
        await nav.getByRole('button', { name: 'Items', exact: true }).click()
        await page.locator('.items-list-row').first().click()
        await page.locator('.item-detail-tabs').getByRole('button', { name: 'Flashcards', exact: true }).click()
        await t.open()
        for (const [index, spec] of cases.entries()) {
          await expect(editor).toHaveText(`Cas ${index + 1}`)
          await check(editor, spec, `${name} ${width}: persisted case ${index + 1}`)
          if (index < cases.length - 1) await next()
        }
        // Remove each format independently, preserving all the others.
        let mask = 15
        await editor.focus()
        await editor.press('ControlOrMeta+a')
        for (let bit = 3; bit >= 0; bit--) {
          await click(formats[bit])
          mask &= ~(1 << bit)
          await check(editor, { mask, rgb: colors.at(-1)[1] }, `${name} ${width}: remove ${formats[bit]}`)
        }
        await click('Couleur normale')
        await check(editor, { mask: 0, rgb: null }, `${name} ${width}: return to normal`)
        assert.deepEqual(t.errors, [])
        console.log(`${name} ${width}: ALL 112 combinations / previews / face switches / save-reload / independent removal PASS`)
        await t.context.close()
      }
    } finally { await browser.close() }
  }
} finally { server.kill('SIGTERM') }
