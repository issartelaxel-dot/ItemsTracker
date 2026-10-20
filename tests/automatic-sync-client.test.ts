import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { AutomaticSync } from '../src/lib/automatic-sync.ts'
import { applyOperations, copy, type SyncOperation } from '../shared/sync-protocol.mjs'

Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true })
Object.defineProperty(globalThis, 'document', { value: new EventTarget(), configurable: true })

test('a local edit made during a slow IndexedDB acknowledgement never reverses an incoming field', async () => {
  const transaction = IDBDatabase.prototype.transaction
  IDBDatabase.prototype.transaction = function (...args: Parameters<typeof transaction>) {
    const tx = transaction.apply(this, args)
    if (args[1] !== 'readwrite') return tx
    return new Proxy(tx, {
      get(target, key) { const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value },
      set(target, key, value) {
        if (key === 'oncomplete') target.oncomplete = event => setTimeout(() => value(event), 40)
        else Reflect.set(target, key, value)
        return true
      },
    })
  }
  let state = { trackingState: { items: { 1: { quiz: { cards: [{ id: 'qa', question: 'initial', answer: 'initial' }] } } } } }
  let local = copy(state), version = 1, editDuringSnapshot = false
  const accepted: SyncOperation[] = []
  const controller: AutomaticSync = new AutomaticSync({
    userId: 777001, normalize: value => copy(value || state), current: () => copy(local), onState: value => { local = copy(value) as typeof local }, onStatus: () => {},
    request: async (_url, options) => {
      if (options?.method === 'POST') {
        const body = JSON.parse(String(options.body)) as { operations: SyncOperation[] }
        accepted.push(...body.operations)
        state = applyOperations(state, body.operations); version++
        return { state: copy(state), version, full: true, acknowledged: body.operations.map(op => op.id) }
      }
      if (editDuringSnapshot) {
        editDuringSnapshot = false
        setTimeout(() => {
          local.trackingState.items[1].quiz.cards[0].answer = 'local answer'
          controller.observe(copy(local))
        }, 5)
      }
      return { state: copy(state), version, full: true }
    },
  })
  try {
    await controller.start()
    state.trackingState.items[1].quiz.cards[0].question = 'remote question'; version++
    editDuringSnapshot = true
    await controller.flush()
    await controller.flush()
    assert.equal(state.trackingState.items[1].quiz.cards[0].question, 'remote question')
    assert.equal(state.trackingState.items[1].quiz.cards[0].answer, 'local answer')
    assert.equal(accepted.some(op => op.path.at(-1) === 'question'), false)
  } finally { controller.stop(); IDBDatabase.prototype.transaction = transaction }
})

test('the first edit of a generated catalogue item preserves its unsaved default metadata', async () => {
  type Data = { trackingState: { items: Record<string, { assignedColleges: string[]; itemComment: string; quiz: { cards: [] } }> } }
  let server: Data = { trackingState: { items: {} } }
  const defaults = { assignedColleges: ['Reference book'], itemComment: '', quiz: { cards: [] as [] } }
  let local: Data = { trackingState: { items: { 1: copy(defaults) } } }, version = 0
  const accepted: SyncOperation[] = []
  const controller = new AutomaticSync({
    userId: 777002, normalize: value => {
      const state = copy(value || server) as Data
      state.trackingState.items[1] ||= copy(defaults)
      return state
    }, current: () => copy(local), onState: value => { local = copy(value) as Data }, onStatus: () => {},
    request: async (_path, options) => {
      if (options?.method === 'POST') {
        const body = JSON.parse(String(options.body)) as { operations: SyncOperation[] }
        accepted.push(...body.operations); server = applyOperations(server, body.operations); version++
        return { version, full: true, state: copy(server), acknowledged: body.operations.map(op => op.id) }
      }
      return { version, full: true, state: copy(server) }
    },
  })
  try {
    await controller.start()
    local.trackingState.items[1].itemComment = 'My note'
    controller.observe(copy(local)); await controller.flush()
    assert.equal(server.trackingState.items[1].itemComment, 'My note')
    assert.deepEqual(server.trackingState.items[1].assignedColleges, ['Reference book'])
    assert.equal(accepted.filter(op => op.type === 'create' && op.path.length === 3).length, 1)
  } finally { controller.stop() }
})
