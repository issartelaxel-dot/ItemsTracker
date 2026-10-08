import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { saveDraft, findDraft, removeDraft, mergeStates, type LocalDraft } from '../src/lib/save-outbox.ts'

test('offline recovery preserves pending image bytes and exact request ID across reloads', async () => {
  const draft: LocalDraft = { key: '10:tab1', userId: 10, body: JSON.stringify({ image: 'data:image/png;base64,AAAA' }),
    baseBody: '{}', baseVersion: 7, imageBaseline: {}, savedAtMs: 1,
    operation: { id: 'stable-request', path: '/api/state', method: 'PATCH', body: '{"baseVersion":7,"requestId":"stable-request","patch":{}}', targetBody: '{}' } }
  await saveDraft(draft)
  assert.deepEqual(await findDraft(10), draft)
  assert.equal(await findDraft(11), null)
  await saveDraft({ ...draft, body: '{"edited":"while request in flight"}', savedAtMs: 2 })
  const recovered = await findDraft(10)
  assert.equal(recovered?.operation?.body, draft.operation?.body)
  assert.equal(recovered?.body, '{"edited":"while request in flight"}')
  await removeDraft(draft.key); assert.equal(await findDraft(10), null)
})
test('drafts from different tabs are preserved independently', async () => {
  const draft: LocalDraft = { key: '20:a', userId: 20, body: 'a', baseBody: '{}', baseVersion: 0, imageBaseline: {}, operation: null, savedAtMs: 1 }
  await saveDraft(draft); await saveDraft({ ...draft, key: '20:b', body: 'b', savedAtMs: 2 })
  assert.equal((await findDraft(20))?.body, 'b')
  await removeDraft('20:b'); assert.equal((await findDraft(20))?.body, 'a')
})
test('three-way recovery merges independent edits but preserves conflicting local values', () => {
  const base = { items: { a: 'old', b: 'old' }, theme: 'light' }
  const local = { items: { a: 'local', b: 'old' }, theme: 'light' }
  const remote = { items: { a: 'old', b: 'remote' }, theme: 'dark' }
  const merged = mergeStates(base, local, remote)
  assert.deepEqual(merged, { value: { items: { a: 'local', b: 'remote' }, theme: 'dark' }, conflicts: [] })
  const conflict = mergeStates(base, local, { ...remote, items: { a: 'other', b: 'remote' } })
  assert.deepEqual(conflict.conflicts, ['/items/a']); assert.equal(conflict.value.items.a, 'local')
  assert.deepEqual(local, { items: { a: 'local', b: 'old' }, theme: 'light' })
})
test('deletions and simultaneous array changes produce explicit conflicts', () => {
  const merged = mergeStates({ a: { n: 1 }, cards: [1] }, { cards: [1, 2] } as any, { a: { n: 2 }, cards: [1, 3] })
  assert.deepEqual(merged.conflicts, ['/a', '/cards']); assert.deepEqual(merged.value.cards, [1, 2])
  assert.equal(Object.hasOwn(merged.value, 'a'), false)
})
