import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hydrateReferenceDefaults as hydrate, referenceAssignments as links, referenceCollegeNames, usesReferenceDefaults } from '../src/lib/academic-college-defaults.ts'
import { buildReferenceAssignments } from '../scripts/import-reference-assignments.mjs'
const dataset = JSON.parse(readFileSync(new URL('../src/data/item-reference-assignments.json', import.meta.url)))
const createItem = () => ({ assignedColleges: [], byCollege: {}, itemComment: '', quiz: { cards: [] } })
const createCollege = () => ({ reviews: 0, mastery: 'Moyen', comments: '' })

test('Study references cover 367 items using stable legacy tracking keys, not LiSA roles', () => {
  assert.equal(Object.keys(links).length, 367)
  assert.equal(referenceCollegeNames.length, 40)
  assert.equal(Object.values(links).reduce((sum, names) => sum + names.length, 0), 1042)
  const canonical = JSON.parse(readFileSync(new URL('../src/data/colleges.json', import.meta.url)))
  assert.deepEqual([...referenceCollegeNames].sort(), [...canonical].sort())
  assert.deepEqual(links[293], ['ANATOMIE ET CYTOLOGIE PATHOLOGIQUES', 'CANCÉROLOGIE'])
  assert.deepEqual(links[10], [], 'No invented assignment for an item absent from reference contents')
  for (const names of Object.values(links)) {
    assert.equal(new Set(names).size, names.length)
    assert.ok(names.every(name => canonical.includes(name)))
  }
  assert.equal(dataset.provenance.relation, 'item_study_reference')
  assert.equal(dataset.provenance.status, 'secondary_source')
})

test('Reference defaults apply to new second-cycle profiles, including Dijon, without changing historical profiles', () => {
  for (const yearCode of ['Y4', 'Y5', 'Y6']) {
    for (const facultyId of ['dijon', 'bordeaux', null]) {
      assert.equal(usesReferenceDefaults({ yearCode, facultyId }), true)
      assert.equal(usesReferenceDefaults({ yearCode, facultyId, legacyExempt: true }), false)
    }
  }
  assert.equal(usesReferenceDefaults({ yearCode: 'Y3' }), false)
  assert.equal(usesReferenceDefaults(null), false)
})

test('Saved selections, empty removals, tracking, notes and cards take precedence over any new defaults', () => {
  const historical = { assignedColleges: ['CANCÉROLOGIE', 'ANATOMIE ET CYTOLOGIE PATHOLOGIQUES'],
    byCollege: { 'CANCÉROLOGIE': { reviews: 4, comments: 'Keep', mastery: 'Bon' } },
    itemComment: 'Preserve notes', quiz: { cards: [{ id: 'existing', question: 'Keep' }] } }
  const empty = createItem()
  const custom = { ...createItem(), assignedColleges: ['PERSONAL'], byCollege: { PERSONAL: { reviews: 2 } } }
  const state = { items: { 293: historical, 1: empty, 7: custom } }
  const snapshot = structuredClone(state)
  const next = hydrate(state, true, createCollege, createItem)
  assert.equal(next.items[293], historical)
  assert.equal(next.items[1], empty, 'Even an empty selection without an action log must not be filled')
  assert.equal(next.items[7], custom)
  assert.deepEqual(state, snapshot)
  assert.equal(Object.keys(next.items).length, 367)
  assert.deepEqual(next.items[81].assignedColleges, links[81])
  assert.deepEqual(next.items[10].assignedColleges, [])
  assert.equal(hydrate(next, true, createCollege, createItem), next, 'Repeated loading must be idempotent')
  assert.equal(hydrate(state, false, createCollege, createItem), state)
  assert.equal(hydrate(state, true, createCollege), state)
})

test('Source import rejects incomplete coverage, unrecognised references and malformed item numbers', () => {
  const raw = { items: Array.from({ length: 367 }, (_, i) => ({ items: i + 1 })),
    referentiels: dataset.references.map(r => ({ code: r.code, titre: r.title, items: '/' })) }
  const provenance = { checkedAt: '2026-10-18', sourceSha256: 'a'.repeat(64) }
  const missing = structuredClone(raw); missing.items.pop()
  assert.throws(() => buildReferenceAssignments(missing, provenance), /367/)
  const unknown = structuredClone(raw); unknown.referentiels[0].code = 'UNRECOGNISED'
  assert.throws(() => buildReferenceAssignments(unknown, provenance), /inconnu/)
  const malformed = structuredClone(raw); malformed.referentiels[0].items = '293X'
  assert.throws(() => buildReferenceAssignments(malformed, provenance), /non reconnu/)
  const outOfRange = structuredClone(raw); outOfRange.referentiels[0].items = '368'
  assert.throws(() => buildReferenceAssignments(outOfRange, provenance), /non reconnu/)
  raw.referentiels[0].items = '293, 293'
  const parsed = buildReferenceAssignments(raw, provenance)
  assert.deepEqual(parsed.items[293], ['ANATOMIE ET CYTOLOGIE PATHOLOGIQUES'])
  assert.deepEqual(parsed.audit.duplicates, [{ code: 'ACP', item: 293 }])
})
