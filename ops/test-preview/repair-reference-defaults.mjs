import { isDeepStrictEqual } from 'node:util'
import { readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const blank = () => ({ favorite: false, reviews: 0, mastery: 'Moyen', comments: '', lastReviewedAt: null, reviewHistory: [] })
const sameSet = (a, b) => Array.isArray(a) && a.length === new Set(a).size && isDeepStrictEqual([...a].sort(), [...b].sort())
export function planReferenceDefaultRepairs(state, references, editorial) {
  const patch = {}, changed = [], preserved = []
  for (const [number, item] of Object.entries(state.items || {})) {
    const roles = editorial.items[number], next = references[number]
    if (!roles || !next) continue
    const old = [...new Set([...roles.writers, ...roles.reviewers])]
    if (!old.length || !sameSet(item.assignedColleges, old) || sameSet(item.assignedColleges, next)) continue
    // This one-off tool is restricted to the isolated TEST database. Never
    // infer that saved production selections are defaults from their content.
    const logs = item.actionLogs ?? []
    const trackers = item.byCollege ?? {}
    const untouched = Array.isArray(logs) && logs.length === 0 && sameSet(Object.keys(trackers), old) &&
      Object.values(trackers).every(entry => entry && typeof entry === 'object' && isDeepStrictEqual({ ...blank(), ...entry }, blank()))
    if (!untouched) { preserved.push(Number(number)); continue }
    const byCollege = Object.fromEntries(old.filter(name => !next.includes(name)).map(name => [name, null]))
    for (const name of next) byCollege[name] = blank()
    patch[number] = { assignedColleges: [...next], byCollege }
    changed.push(Number(number))
  }
  return { patch, changed, preserved }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode = 'plan', email] = process.argv.slice(2)
  if (!['plan', 'apply'].includes(mode) || !['testeur@preview.invalid', 'testeur2@preview.invalid'].includes(email)) throw new Error('Explicit test account and plan|apply required.')
  const url = new URL(process.env.DATABASE_URL || '')
  if (url.pathname !== '/itemstracker_test' || !process.env.PREVIEW_HOST?.startsWith('test-itemstracker-')) throw new Error('Isolated preview only. Production is refused.')
  const { default: pg } = await import('pg')
  const { createStateStore } = await import('../../server/state-store.mjs')
  const pool = new pg.Pool({ connectionString: url.toString() })
  try {
    const user = (await pool.query(`SELECT u.id,s.storage_version,p.year_code,p.faculty_id,p.legacy_exempt FROM users u
      JOIN user_state s ON s.user_id=u.id LEFT JOIN academic_profiles p ON p.user_id=u.id WHERE u.email=$1`, [email])).rows[0]
    if (!user || user.storage_version !== 2 || user.legacy_exempt) throw new Error('Expected a non-historical test account in current storage format.')
    const references = JSON.parse(await readFile(new URL('../../src/data/item-reference-assignments.json', import.meta.url))).items
    const editorial = JSON.parse(await readFile(new URL('../../server/data/academic-lisa-2026-college-links.json', import.meta.url)))
    const store = createStateStore(pool)
    const before = await store.read(user.id)
    const plan = planReferenceDefaultRepairs(before.state.trackingState, references, editorial)
    if (mode === 'plan' || !plan.changed.length) {
      console.log(JSON.stringify({ mode, userId: user.id, version: before.version, changed: plan.changed, preserved: plan.preserved }))
    } else {
      const backup = `/tmp/reference-defaults-${user.id}-${randomUUID()}.json`
      await writeFile(backup, JSON.stringify({ user, snapshot: before, plan }, null, 2), { mode: 0o600, flag: 'wx' })
      const result = await store.write(user.id, 'state-patch', { baseVersion: before.version, requestId: randomUUID(), patch: { trackingState: { items: plan.patch } } })
      const after = await store.read(user.id)
      for (const [number, oldItem] of Object.entries(before.state.trackingState.items)) {
        const newItem = after.state.trackingState.items[number]
        if (plan.changed.includes(Number(number))) {
          const { assignedColleges: a, byCollege: b, ...oldRest } = oldItem
          const { assignedColleges: c, byCollege: d, ...newRest } = newItem
          if (!sameSet(c, references[number]) || !isDeepStrictEqual(oldRest, newRest)) throw new Error(`Post-write mismatch at item ${number}; backup retained: ${backup}`)
        } else if (!isDeepStrictEqual(oldItem, newItem)) throw new Error(`Protected item changed: ${number}; backup retained: ${backup}`)
      }
      const profile = (await pool.query('SELECT year_code,faculty_id FROM academic_profiles WHERE user_id=$1', [user.id])).rows[0]
      if (profile.year_code !== user.year_code || profile.faculty_id !== user.faculty_id) throw new Error('Academic profile changed unexpectedly.')
      console.log(JSON.stringify({ mode, userId: user.id, oldVersion: before.version, newVersion: result.version, changed: plan.changed, preserved: plan.preserved, backup, protectedDataUnchanged: true }))
    }
  } finally { await pool.end() }
}
