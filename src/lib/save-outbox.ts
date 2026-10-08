export type SaveOperation = {
  id: string
  path: '/api/state' | '/api/state/images'
  method: 'PUT' | 'PATCH' | 'POST'
  body: string
  targetBody?: string
  upsert?: Record<string, string>
  removed?: string[]
}
export type LocalDraft = {
  key: string
  userId: number
  body: string
  baseBody: string
  baseVersion: number
  imageVersions?: Record<string, string>
  imageBaseline: Record<string, string>
  operation: SaveOperation | null
  savedAtMs: number
}
let database: Promise<IDBDatabase> | undefined
function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('itemstracker-save-recovery', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { database = undefined; reject(request.error) }
  })
  return database
}
export async function saveDraft(draft: LocalDraft) {
  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite')
    tx.objectStore('drafts').put(draft)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}
export async function findDraft(userId: number) {
  const db = await openDatabase()
  return new Promise<LocalDraft | null>((resolve, reject) => {
    const request = db.transaction('drafts').objectStore('drafts').getAll()
    request.onsuccess = () => resolve((request.result as LocalDraft[])
      .filter(draft => draft.userId === userId).sort((a, b) => b.savedAtMs - a.savedAtMs)[0] || null)
    request.onerror = () => reject(request.error)
  })
}
export async function removeDraft(key: string) {
  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite')
    tx.objectStore('drafts').delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i]))
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>
  return Object.keys(x).length === Object.keys(y).length && Object.keys(x).every(k => Object.hasOwn(y, k) && equal(x[k], y[k]))
}
// Three-way merge preserves local data. Conflicting arrays remain local and are
// never sent automatically; the UI requests a choice after exporting recovery.
export function mergeStates<T>(base: T, local: T, remote: T): { value: T; conflicts: string[] } {
  const conflicts: string[] = []
  function visit(b: unknown, l: unknown, r: unknown, path: string): unknown {
    if (equal(l, b)) return structuredClone(r)
    if (equal(r, b) || equal(l, r)) return structuredClone(l)
    if (l && r && typeof l === 'object' && typeof r === 'object' && !Array.isArray(l) && !Array.isArray(r)) {
      const bb = b && typeof b === 'object' ? b as Record<string, unknown> : {}
      const ll = l as Record<string, unknown>, rr = r as Record<string, unknown>
      const result: Record<string, unknown> = {}
      for (const key of new Set([...Object.keys(bb), ...Object.keys(ll), ...Object.keys(rr)])) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Clé de données invalide.')
        const value = visit(bb[key], ll[key], rr[key], `${path}/${key}`)
        if (value !== undefined) result[key] = value
      }
      return result
    }
    conflicts.push(path || '/')
    return structuredClone(l)
  }
  return { value: visit(base, local, remote, '') as T, conflicts }
}
