import { applyOperations, copy, diffOperations, equal, type SyncOperation } from '../../shared/sync-protocol.mjs'

type Card = { id: string; [key: string]: unknown }
type Item = { quiz?: { cards?: Card[] }; [key: string]: unknown }
type State = { trackingState: { items: Record<string, Item> }; [key: string]: unknown }
type Snapshot = { version: number; state?: State | null; unchanged?: boolean; full?: boolean; selectedItems?: number[]; imageVersions?: Record<string, string>; tombstones?: string[]; acknowledged?: string[] }
type RecordState = { key: string; userId: number; base: State; version: number; operations: SyncOperation[]; imageVersions: Record<string, string>; knownItems?: string[]; savedAt: number }
type Options = {
  userId: number
  request: (path: string, init?: RequestInit) => Promise<unknown>
  normalize: (state: State | null) => State
  current: () => State
  onState: (state: State) => void
  onStatus: (status: 'saving' | 'saved' | 'offline' | 'error', message?: string) => void
  legacy?: () => Promise<{ base: State; operations: SyncOperation[]; cleanup: () => Promise<void> } | null>
}

let dbPromise: Promise<IDBDatabase> | undefined
function database() {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const timer = setTimeout(() => { dbPromise = undefined; reject(Error('Le stockage local ne répond pas. Garde cet onglet ouvert.')) }, 8000)
      let req: IDBOpenDBRequest
      try { req = indexedDB.open('itemstracker-automatic-sync', 2) } catch (error) { clearTimeout(timer); reject(error); return }
      req.onupgradeneeded = () => {
        const db = req.result
        const clients = db.objectStoreNames.contains('clients') ? req.transaction!.objectStore('clients') : db.createObjectStore('clients', { keyPath: 'key' })
        if (!clients.indexNames.contains('userId')) clients.createIndex('userId', 'userId')
        const operations = db.createObjectStore('operations', { keyPath: 'id' })
        operations.createIndex('userId', 'userId')
        // Preserve queues from an earlier test build without a network request.
        const cursor = clients.openCursor()
        cursor.onsuccess = () => {
          const entry = cursor.result
          if (!entry) return
          const record = entry.value as RecordState
          for (const operation of record.operations || []) operations.put({ id: operation.id, userId: record.userId, operation })
          entry.continue()
        }
      }
      req.onsuccess = () => { clearTimeout(timer); req.result.onversionchange = () => { req.result.close(); dbPromise = undefined }; resolve(req.result) }
      req.onerror = () => { clearTimeout(timer); dbPromise = undefined; reject(req.error) }
    }).catch(error => { dbPromise = undefined; throw error })
  }
  return dbPromise
}
async function records(userId: number): Promise<RecordState[]> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['clients', 'operations'])
    const clients = tx.objectStore('clients').index('userId').getAll(userId)
    const operations = tx.objectStore('operations').index('userId').getAll(userId)
    tx.oncomplete = () => resolve(clients.result.map((record: RecordState, index: number) => ({
      ...record, operations: index === 0 ? operations.result.map((row: { operation: SyncOperation }) => row.operation) : [],
    })))
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}
async function store(record: RecordState, acknowledged: string[] = [], obsoleteKeys: string[] = []) {
  const db = await database()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['clients', 'operations'], 'readwrite')
    const timer = setTimeout(() => {
      try { tx.abort() } catch { /* Already completed. */ }
      dbPromise = undefined
      reject(Error('Le stockage local ne répond pas. Garde cet onglet ouvert.'))
    }, 8000)
    tx.oncomplete = () => { clearTimeout(timer); resolve() }
    tx.onerror = () => { clearTimeout(timer); dbPromise = undefined; reject(tx.error) }
    tx.onabort = () => { clearTimeout(timer); dbPromise = undefined; reject(tx.error) }
    try {
      // Schedule every request synchronously. Safari may auto-close a write
      // transaction while a getAll callback processes a large snapshot.
      const clients = tx.objectStore('clients'), operations = tx.objectStore('operations')
      clients.put({ ...record, operations: [] })
      for (const operation of record.operations) operations.put({ id: operation.id, userId: record.userId, operation })
      for (const id of acknowledged) operations.delete(id)
      for (const key of obsoleteKeys) if (key !== record.key) clients.delete(key)
    } catch (error) {
      clearTimeout(timer)
      try { tx.abort() } catch { /* The failure still rejects the checkpoint. */ }
      reject(error)
    }
  })
}

// One instance per active session. Other sessions can replay a stranded queue:
// operation IDs make those replays harmless, including a lost server ACK.
export class AutomaticSync {
  private options: Options
  private key: string
  private base: State
  private view: State
  private version = 0
  private operations: SyncOperation[] = []
  private imageVersions: Record<string, string> = {}
  private knownItems = new Set<string>()
  private media = new Map<string, { bytes: string; version: string }>()
  private tombstones = new Set<string>()
  private durable: Promise<void> = Promise.resolve()
  private flight: Promise<boolean> | null = null
  private timer?: ReturnType<typeof setTimeout>
  private interval?: ReturnType<typeof setInterval>
  private stopped = false
  private ready = false
  private connected = false
  private obsoleteKeys: string[] = []
  private durableAcknowledgements = new Set<string>()
  // Keep pending work and incoming state moving while another app/tab is used.
  // Browsers can suspend background timers; focus/online also trigger a pull.
  private wake = () => { void this.flush() }

  constructor(options: Options) {
    this.options = options
    this.key = `${options.userId}:${crypto.randomUUID()}`
    this.base = options.normalize(null)
    this.view = copy(this.base)
  }
  private persist(acknowledged: string[] = []) {
    for (const id of acknowledged) this.durableAcknowledgements.add(id)
    const receipts = [...this.durableAcknowledgements]
    const record = copy({ key: this.key, userId: this.options.userId, base: this.base, version: this.version,
      operations: this.operations, imageVersions: this.imageVersions, knownItems: [...this.knownItems], savedAt: Date.now() })
    const obsolete = this.obsoleteKeys.splice(0)
    this.durable = this.durable.catch(() => {}).then(() => store(record, receipts, obsolete)).then(() => {
      for (const id of receipts) this.durableAcknowledgements.delete(id)
    })
    return this.durable
  }
  async start() {
    const recovered = await records(this.options.userId)
    if (this.stopped) return
    this.obsoleteKeys = recovered.map(record => record.key)
    const latest = recovered.sort((a, b) => b.version - a.version || b.savedAt - a.savedAt)[0]
    const legacy = !latest ? await this.options.legacy?.() : null
    if (latest) {
      this.base = this.options.normalize(latest.base)
      this.version = latest.version
      this.imageVersions = latest.imageVersions || {}
      this.knownItems = new Set(latest.knownItems || Object.keys(latest.base.trackingState.items))
      this.operations = [...new Map(recovered.flatMap(r => r.operations).map(op => [op.id, op])).values()]
      this.view = applyOperations(this.base, this.operations)
    } else if (legacy) {
      this.base = this.options.normalize(legacy.base)
      this.operations = legacy.operations
      this.view = applyOperations(this.base, this.operations)
    }
    try {
      const snapshot = await (this.operations.length
        ? this.options.request('/api/sync/receipts', { method: 'POST', body: JSON.stringify({ ids: this.operations.map(op => op.id) }) })
        : this.options.request('/api/sync')) as Snapshot
      if (this.stopped) return
      await this.receive(snapshot, false)
      this.connected = true
    } catch (error) {
      if (!latest && !legacy) throw error
      this.view = applyOperations(this.base, this.operations)
      this.options.onStatus('offline', 'Hors connexion — modifications conservées sur cet appareil.')
    }
    if (this.stopped) return
    this.ready = true
    this.options.onState(copy(this.view))
    await this.persist()
    await legacy?.cleanup()
    this.interval = setInterval(this.wake, 2000)
    window.addEventListener('online', this.wake)
    window.addEventListener('focus', this.wake)
    document.addEventListener('visibilitychange', this.wake)
    if (this.operations.length) this.schedule()
    else if (this.connected) this.options.onStatus('saved')
  }
  observe(state: State) {
    if (!this.ready || this.stopped) return
    const ops = diffOperations(this.view, state)
    if (!ops.length) return
    // Generated catalogue defaults are a UI baseline, not necessarily a saved
    // item. Its first field edit must preserve that baseline on the server.
    const bootstrap: SyncOperation[] = []
    for (const item of new Set(ops.filter(op => op.path[0] === 'trackingState').map(op => op.path[2]))) {
      if (this.knownItems.has(item) || this.operations.some(op => op.type === 'create' && op.path.length === 3 && op.path[2] === item)) continue
      const previous = this.view.trackingState.items[item]
      if (previous) bootstrap.push({ id: crypto.randomUUID(), type: 'create', path: ['trackingState', 'items', item], value: copy(previous) })
    }
    this.view = copy(state)
    this.operations.push(...bootstrap, ...ops)
    void this.persist().catch(() => this.options.onStatus('error', 'Copie locale indisponible. Garde cet onglet ouvert.'))
    this.options.onStatus(this.connected ? 'saving' : 'offline')
    this.schedule()
  }
  // Record each review synchronously outside React state updater functions.
  // Updating the observed view here prevents its subsequent render generating
  // the same increment twice (React StrictMode may invoke updaters twice).
  recordReview(item: number, cardId: string, result: string, at: string) {
    if (!this.ready || this.stopped) return
    this.observe(this.options.current())
    const root = ['trackingState', 'items', String(item)]
    const path = [...root, 'quiz', 'cards', '@' + cardId]
    const ops: SyncOperation[] = [
      { id: crypto.randomUUID(), type: 'increment', path: [...path, 'quizCount'], value: 1 },
      { id: crypto.randomUUID(), type: 'set', path: [...path, 'lastResult'], value: result },
      { id: crypto.randomUUID(), type: 'set', path: [...path, 'lastReviewedAt'], value: at },
      { id: crypto.randomUUID(), type: 'set', path: [...root, 'lastQuizResult'], value: result },
      { id: crypto.randomUUID(), type: 'set', path: [...root, 'lastReviewDate'], value: at },
    ]
    this.operations.push(...ops)
    this.view = applyOperations(this.view, ops)
    void this.persist().catch(() => this.options.onStatus('error', 'Copie locale indisponible. Garde cet onglet ouvert.'))
    this.options.onStatus('saving')
    this.schedule()
  }
  imageVersion(item: number, card: string, slot: string) { return this.imageVersions[`${item}:${card}:${slot}`] }
  acceptRemoteImage(item: number, card: string, slot: string, bytes: string, expected?: string) {
    const key = `${item}:${card}:${slot}`
    if (expected !== this.imageVersions[key]) return false
    this.media.set(key, { bytes, version: expected || '' })
    for (const state of [this.base, this.view]) {
      const entry = state.trackingState.items[item]?.quiz?.cards?.find(c => c.id === card)
      if (entry) entry[`${slot}ImageDataUrl`] = bytes
    }
    return true
  }
  private schedule() {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), 450)
  }
  private async receive(snapshot: Snapshot, capture = true) {
    if (!Number.isSafeInteger(snapshot.version) || snapshot.version < 0 || !snapshot.unchanged && !Object.hasOwn(snapshot, 'state') ||
      snapshot.acknowledged && (!Array.isArray(snapshot.acknowledged) || snapshot.acknowledged.some(id => typeof id !== 'string'))) {
      throw Error('Réponse d’enregistrement invalide. Les modifications locales sont conservées.')
    }
    if (snapshot.unchanged && !snapshot.acknowledged?.length && !this.operations.length) return
    if (capture && this.ready) this.observe(this.options.current())
    const acknowledged = new Set(snapshot.acknowledged || [])
    for (const op of this.operations) if (acknowledged.has(op.id)) {
      const item = op.path[2], entity = op.path.find(p => p.startsWith('@'))?.slice(1)
      if (!item || !entity) continue
      for (const slot of ['front', 'back']) {
        const field = `${slot}ImageDataUrl`
        const bytes = op.path.at(-1) === field ? op.value : op.type === 'create' ? (op.value as Record<string, unknown>)?.[field] : undefined
        const key = `${item}:${entity}:${slot}`, version = snapshot.imageVersions?.[key]
        if (typeof bytes === 'string' && version) this.media.set(key, { bytes, version })
      }
    }
    this.operations = this.operations.filter(op => !acknowledged.has(op.id))
    if (!snapshot.unchanged) {
      const remote = snapshot.state
      if (snapshot.full) this.knownItems = new Set(Object.keys(remote?.trackingState.items || {}))
      else {
        for (const item of snapshot.selectedItems || []) this.knownItems.delete(String(item))
        for (const item of Object.keys(remote?.trackingState.items || {})) this.knownItems.add(item)
      }
      if (snapshot.full || !remote) this.base = this.options.normalize(remote || null)
      else {
        const items = { ...this.base.trackingState.items }
        for (const n of snapshot.selectedItems || []) delete items[n]
        Object.assign(items, remote.trackingState.items)
        this.base = this.options.normalize({ ...this.base, ...remote, trackingState: { ...this.base.trackingState, ...remote.trackingState, items } })
      }
      if (snapshot.full) this.imageVersions = snapshot.imageVersions || {}
      else {
        for (const key of Object.keys(this.imageVersions)) if (snapshot.selectedItems?.includes(Number(key.split(':')[0]))) delete this.imageVersions[key]
        Object.assign(this.imageVersions, snapshot.imageVersions || {})
      }
      for (const [n, item] of Object.entries(this.base.trackingState.items)) for (const card of item.quiz?.cards || []) {
        for (const slot of ['front', 'back']) {
          const key = `${n}:${card.id}:${slot}`, cached = this.media.get(key)
          if (cached && cached.version === this.imageVersions[key]) card[`${slot}ImageDataUrl`] = cached.bytes
        }
      }
    }
    this.version = snapshot.version
    this.tombstones = new Set(snapshot.tombstones || [])
    this.view = applyOperations(this.base, this.operations, new Set(this.tombstones))
    // Publish before awaiting IndexedDB. During a large snapshot write, a user
    // can edit another field; leaving the old UI on screen would make that edit
    // look like a reversal of the incoming fields and queue a stale overwrite.
    if (!this.stopped && this.ready && !equal(this.options.current(), this.view)) this.options.onState(copy(this.view))
    await this.persist([...acknowledged])
  }
  flush(): Promise<boolean> {
    if (this.stopped || !this.ready) return Promise.resolve(false)
    if (this.flight) return this.flight
    this.flight = Promise.resolve().then(async () => {
      try {
        this.observe(this.options.current())
        // Freeze each batch only after its durable transaction has committed.
        try { await this.durable } catch {
          this.options.onStatus('error', 'La copie locale est indisponible. Garde cet onglet ouvert.')
          void this.persist().catch(() => {})
          return false
        }
        const batch: SyncOperation[] = []
        let bytes = 0
        for (const op of this.operations) {
          const size = new TextEncoder().encode(JSON.stringify(op)).byteLength
          if (batch.length && (batch.length >= 300 || bytes + size > 4_000_000)) break
          batch.push(op); bytes += size
        }
        const operations = copy(batch)
        const response = operations.length
          ? await this.options.request('/api/sync', { method: 'POST', body: JSON.stringify({ operations, since: this.version }) })
          : await this.options.request(`/api/sync?since=${this.version}`)
        if (this.stopped) return false
        this.connected = true
        await this.receive(response as Snapshot)
        this.options.onStatus(this.operations.length ? 'saving' : 'saved')
        if (this.operations.length) this.schedule()
        return !this.operations.length
      } catch (error) {
        this.connected = false
        const status = (error as { status?: number })?.status
        this.options.onStatus(status && status < 500 && status !== 429 ? 'error' : 'offline',
          status && status < 500 && status !== 429 ? (error instanceof Error ? error.message : 'Enregistrement indisponible.')
            : 'Hors connexion — modifications conservées sur cet appareil.')
        return false
      } finally { this.flight = null }
    })
    return this.flight
  }
  async restore(operationId: string) {
    if (!(await this.flush())) throw Error('Les modifications en attente seront enregistrées avant la restauration.')
    const response = await this.options.request(`/api/sync/history/${encodeURIComponent(operationId)}/restore`, {
      method: 'POST', body: JSON.stringify({ requestId: crypto.randomUUID(), since: this.version }),
    })
    await this.receive(response as Snapshot)
  }
  stop() {
    this.stopped = true
    clearTimeout(this.timer)
    clearInterval(this.interval)
    window.removeEventListener('online', this.wake)
    window.removeEventListener('focus', this.wake)
    document.removeEventListener('visibilitychange', this.wake)
  }
}
