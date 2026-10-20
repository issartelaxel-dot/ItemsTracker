// Shared, deterministic operation semantics. Server acceptance order decides
// concurrent scalar edits. Keyed collections never use positional array writes.
const forbidden = new Set(['__proto__', 'prototype', 'constructor'])
const keyed = new Set(['cards', 'lisaSheets', 'platformSheets', 'choices'])
const counters = new Set(['reviews', 'quizCount'])
const eventLists = new Set(['actionLogs', 'reviewHistory'])
export const copy = value => value === undefined ? undefined : structuredClone(value)
export const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
export const pathKey = path => JSON.stringify(path)

export function validateOperation(op) {
  if (!op || typeof op.id !== 'string' || !/^[\w:-]{8,160}$/.test(op.id)) throw Error('Invalid operation ID')
  if (!['set', 'delete', 'create', 'increment', 'append', 'member-add', 'member-remove', 'order', 'restore'].includes(op.type)) throw Error('Invalid operation type')
  if (!Array.isArray(op.path) || !op.path.length || op.path.length > 16 || op.path.some(p => typeof p !== 'string' || !p || p.length > 512 || forbidden.has(p))) throw Error('Invalid operation path')
  if (!['trackingState', 'theme', 'focusMode', 'dateFormat', 'timeZone', 'youtubeDisplayMode', 'shuffleQuizCards', 'profile'].includes(op.path[0])) throw Error('Invalid state field')
  if (op.path[0] === 'trackingState' && (op.path[1] !== 'items' || !/^\d{1,4}$/.test(op.path[2] || '') || +op.path[2] < 1)) throw Error('Invalid item path')
  if (op.path[0] === 'profile' && op.path.includes('password')) throw Error('Passwords are not synchronized')
  if (op.type === 'increment' && (!Number.isSafeInteger(op.value) || Math.abs(op.value) > 10000 || !counters.has(op.path.at(-1)))) throw Error('Invalid increment')
  if (op.type === 'order' && (!Array.isArray(op.value) || op.value.some(id => typeof id !== 'string'))) throw Error('Invalid card order')
  function safe(value) {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) { if (forbidden.has(key)) throw Error('Invalid data key'); safe(child) }
  }
  safe(op.value)
  if (JSON.stringify(op).length > 4_000_000) throw Error('Operation too large')
}

export function valueAt(state, path) {
  let value = state
  for (const key of path) value = key.startsWith('@') && Array.isArray(value)
    ? value.find(entry => entry?.id === key.slice(1)) : value?.[key]
  return value
}

export function applyOperation(state, op, tombstones = new Set()) {
  validateOperation(op)
  const entityPath = op.path.slice(0, op.path.findIndex(k => k.startsWith('@')) + 1)
  const itemPath = op.path[0] === 'trackingState' ? op.path.slice(0, 3) : []
  if (op.type !== 'restore' && ([entityPath, itemPath].some(p => p.length && tombstones.has(pathKey(p))))) return state
  let parent = state
  for (let i = 0; i < op.path.length - 1; i++) {
    const key = op.path[i], next = op.path[i + 1]
    if (Array.isArray(parent) && key.startsWith('@')) {
      parent = parent.find(entry => entry.id === key.slice(1))
      if (!parent) return state // An edit never resurrects a deleted card.
    } else {
      if (!parent[key] || typeof parent[key] !== 'object') parent[key] = next.startsWith('@') ? [] : {}
      parent = parent[key]
    }
  }
  const key = op.path.at(-1)
  const isEntity = key.startsWith('@') && Array.isArray(parent)
  const index = isEntity ? parent.findIndex(entry => entry.id === key.slice(1)) : key
  const before = isEntity ? parent[index] : parent[key]
  let after = copy(op.value)
  if (op.type === 'delete') {
    if (isEntity) { if (index >= 0) parent.splice(index, 1) } else delete parent[key]
    if (isEntity || op.path.length === 3 && op.path[0] === 'trackingState') tombstones.add(pathKey(op.path))
    return state
  }
  if (op.type === 'create' && before !== undefined) return state
  if (op.type === 'increment') after = Math.max(0, (Number(before) || 0) + op.value)
  const cardCounter = op.type === 'increment' && key === 'quizCount' && op.path.includes('cards')
  const createdCard = op.type === 'create' && isEntity && op.path.at(-2) === 'cards'
  if (cardCounter || createdCard) {
    const item = state.trackingState.items[op.path[2]]
    const total = Number.isFinite(item.quizCount) ? item.quizCount : (item.quiz?.cards || []).reduce((sum, card) => sum + (Number(card.quizCount) || 0), 0)
    item.quizCount = Math.max(0, total + (cardCounter ? after - (Number(before) || 0) : Number(op.value?.quizCount) || 0))
  }
  if (op.type === 'append') {
    after = [...(Array.isArray(before) ? before : []), copy(op.value)]
    if (key === 'actionLogs') after = after.slice(-200)
  }
  if (op.type === 'member-add') after = [...new Set([...(Array.isArray(before) ? before : []), op.value])]
  if (op.type === 'member-remove') after = (Array.isArray(before) ? before : []).filter(v => v !== op.value)
  if (op.type === 'order') {
    const list = Array.isArray(before) ? before : []
    const ids = op.value
    after = [...ids.map(id => list.find(v => v.id === id)).filter(Boolean), ...list.filter(v => !ids.includes(v.id))]
  }
  if (op.type === 'restore') tombstones.delete(pathKey(op.path))
  if (isEntity) { if (index < 0) parent.push(after); else parent[index] = after } else parent[key] = after
  return state
}

export function applyOperations(state, operations, tombstones = new Set()) {
  const result = copy(state)
  for (const op of operations) applyOperation(result, op, tombstones)
  return result
}

export function diffOperations(previous, next, makeId = () => crypto.randomUUID()) {
  const operations = []
  const add = (type, path, value) => operations.push({ id: makeId(), type, path, ...(value !== undefined ? { value: copy(value) } : {}) })
  function visit(a, b, path) {
    if (equal(a, b) || path[0] === 'profile' && path.at(-1) === 'password') return
    const key = path.at(-1)
    if (path.length === 4 && key === 'quizCount' && path[0] === 'trackingState') return // Derived from card review events.
    if (b === undefined) { add('delete', path); return }
    if (Array.isArray(b)) {
      const old = Array.isArray(a) ? a : []
      if (keyed.has(key)) {
        const before = new Map(old.map(v => [v.id, v])), after = new Map(b.map(v => [v.id, v]))
        for (const [id] of before) if (!after.has(id)) add('delete', [...path, '@' + id])
        for (const [id, value] of after) {
          if (!before.has(id)) add('create', [...path, '@' + id], value)
          else visit(before.get(id), value, [...path, '@' + id])
        }
        const projected = [...old.filter(v => after.has(v.id)), ...b.filter(v => !before.has(v.id))].map(v => v.id)
        if (!equal(projected, b.map(v => v.id))) add('order', path, b.map(v => v.id))
      } else if (eventLists.has(key)) {
        const counts = new Map()
        for (const value of old) { const k = JSON.stringify(value); counts.set(k, (counts.get(k) || 0) + 1) }
        if (!b.length) { add('set', path, []); return }
        for (const value of b) { const k = JSON.stringify(value); if (counts.get(k)) counts.set(k, counts.get(k) - 1); else add('append', path, value) }
      } else if (b.every(v => typeof v === 'string') && old.every(v => typeof v === 'string')) {
        for (const v of old) if (!b.includes(v)) add('member-remove', path, v)
        for (const v of b) if (!old.includes(v)) add('member-add', path, v)
      } else add('set', path, b)
      return
    }
    if (b && typeof b === 'object') {
      for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b)])) {
        if (forbidden.has(k)) throw Error('Invalid data key')
        visit(a?.[k], b[k], [...path, k])
      }
    } else if (counters.has(key) && Number.isFinite(b) && Number.isFinite(a)) add('increment', path, b - a)
    else add('set', path, b)
  }
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) visit(previous[key], next[key], [key])
  return operations
}
