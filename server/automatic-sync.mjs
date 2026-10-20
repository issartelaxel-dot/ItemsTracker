import crypto from 'node:crypto'
import { applyOperation, applyOperations, copy, validateOperation, valueAt } from '../shared/sync-protocol.mjs'
import { StateError } from './state-model.mjs'
import { readMedia } from './media-store.mjs'

export function createAutomaticSync(pool, store) {
  async function init() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_sync_operations (
        sequence BIGSERIAL UNIQUE, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        operation_id TEXT NOT NULL, request_hash TEXT NOT NULL, operation JSONB NOT NULL,
        previous_value JSONB, previous_exists BOOLEAN NOT NULL, version BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(user_id,operation_id)
      );
      CREATE INDEX IF NOT EXISTS user_sync_history ON user_sync_operations(user_id,sequence DESC);
      CREATE TABLE IF NOT EXISTS user_sync_commits (
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, version BIGINT NOT NULL,
        items JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(user_id,version)
      );
      CREATE TABLE IF NOT EXISTS user_sync_tombstones (
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, path TEXT NOT NULL,
        PRIMARY KEY(user_id,path)
      );
    `)
  }

  async function snapshot(client, userId, since, acknowledged = []) {
    const meta = (await client.query('SELECT version FROM user_state WHERE user_id=$1', [userId])).rows[0]
    const version = Number(meta?.version || 0)
    const tombstones = (await client.query('SELECT path FROM user_sync_tombstones WHERE user_id=$1', [userId])).rows.map(r => r.path)
    if (Number.isSafeInteger(since) && since === version) return { version, acknowledged, tombstones, unchanged: true }
    const commits = Number.isSafeInteger(since) && since >= 0 && since < version
      ? (await client.query('SELECT version,items FROM user_sync_commits WHERE user_id=$1 AND version>$2 ORDER BY version', [userId, since])).rows : []
    const full = !Number.isSafeInteger(since) || commits.length !== version - since
    const selected = full ? null : [...new Set(commits.flatMap(row => row.items))].map(Number)
    const row = await store.load(client, userId, selected)
    const state = row ? { ...store.payload(row), updatedAt: row.updatedAt } : null
    const images = (await client.query(`SELECT item_number,card_id,image_slot,content_hash,updated_at FROM user_quiz_images
      WHERE user_id=$1 AND item_number<>0${selected === null ? '' : ' AND item_number=ANY($2::integer[])'}`,
    selected === null ? [userId] : [userId, selected])).rows
    if (state?.profile?.hasPhoto) {
      const avatar = (await client.query(`SELECT i.*,COALESCE(NULLIF(i.image_data,''),b.image_data,'') AS image_data
        FROM user_quiz_images i LEFT JOIN user_media_blobs b USING(user_id,blob_key)
        WHERE i.user_id=$1 AND i.item_number=0 AND i.card_id='__profile__'`, [userId])).rows[0]
      if (avatar) state.profile.photoUrl = await readMedia(avatar, store.mediaStore)
    }
    return { state, version, full, selectedItems: selected, tombstones, acknowledged, images,
      imageVersions: Object.fromEntries(images.map(r => [`${r.item_number}:${r.card_id}:${r.image_slot}`, r.content_hash || r.updated_at])) }
  }

  async function read(userId, since) { return store.transaction(userId, client => snapshot(client, userId, since)) }
  async function receipts(userId, ids) {
    if (!Array.isArray(ids) || ids.length > 20000 || ids.some(id => typeof id !== 'string' || id.length > 160)) throw new StateError(400, 'INVALID_OPERATION_IDS', 'Identifiants de modifications invalides.')
    return store.transaction(userId, async client => {
      const acknowledged = (await client.query('SELECT operation_id FROM user_sync_operations WHERE user_id=$1 AND operation_id=ANY($2::text[])', [userId, ids])).rows.map(r => r.operation_id)
      return snapshot(client, userId, undefined, acknowledged)
    })
  }

  async function write(userId, operations, since) {
    if (!Array.isArray(operations) || operations.length > 300) throw new StateError(400, 'INVALID_OPERATIONS', 'Trop de modifications dans une requête.')
    for (const op of operations) {
      try { validateOperation(op) } catch (error) { throw new StateError(400, 'INVALID_OPERATION', error.message) }
    }
    return store.transaction(userId, async client => {
      const seen = (await client.query('SELECT operation_id,request_hash FROM user_sync_operations WHERE user_id=$1 AND operation_id=ANY($2::text[])', [userId, operations.map(op => op.id)])).rows
      const receipts = new Map(seen.map(r => [r.operation_id, r.request_hash]))
      const pending = []
      for (const op of operations) {
        const hash = crypto.createHash('sha256').update(JSON.stringify(op)).digest('hex')
        if (receipts.has(op.id) && receipts.get(op.id) !== hash) throw new StateError(409, 'SYNC_OPERATION_REUSED', 'Identifiant de modification réutilisé avec un contenu différent.')
        if (!receipts.has(op.id)) { pending.push({ op, hash }); receipts.set(op.id, hash) }
      }
      if (pending.length) {
        const row = await store.load(client, userId)
        const state = copy(store.payload(row)), version = Number(row?.version || 0) + 1
        const tombstones = new Set((await client.query('SELECT path FROM user_sync_tombstones WHERE user_id=$1', [userId])).rows.map(r => r.path))
        const oldTombstones = new Set(tombstones), touched = new Set()
        for (const { op, hash } of pending) {
          let before = ['set', 'delete', 'create', 'restore'].includes(op.type) ? copy(valueAt(state, op.path)) : undefined
          const entity = op.path.find(key => key.startsWith('@'))?.slice(1)
          const imageField = ['frontImageDataUrl', 'backImageDataUrl'].includes(op.path.at(-1))
          const removedCard = op.type === 'delete' && op.path.at(-1)?.startsWith('@') && op.path.includes('cards')
          const removedItem = op.type === 'delete' && op.path.length === 3 && op.path[0] === 'trackingState'
          if (op.path[0] === 'profile' && op.path[1] === 'photoUrl') {
            const avatar = (await client.query(`SELECT i.*,COALESCE(NULLIF(i.image_data,''),b.image_data,'') AS image_data
              FROM user_quiz_images i LEFT JOIN user_media_blobs b USING(user_id,blob_key)
              WHERE i.user_id=$1 AND i.item_number=0 AND i.card_id='__profile__'`, [userId])).rows[0]
            if (avatar) before = await readMedia(avatar, store.mediaStore)
          }
          if (imageField || removedCard || removedItem) {
            const images = (await client.query(`SELECT i.*,COALESCE(NULLIF(i.image_data,''),b.image_data,'') AS image_data
              FROM user_quiz_images i LEFT JOIN user_media_blobs b USING(user_id,blob_key)
              WHERE i.user_id=$1 AND i.item_number=$2${removedItem ? '' : ' AND i.card_id=$3'}`,
            removedItem ? [userId, Number(op.path[2])] : [userId, Number(op.path[2]), entity])).rows
            for (const image of images) {
              const field = `${image.image_slot}ImageDataUrl`, data = await readMedia(image, store.mediaStore)
              if (imageField && op.path.at(-1) === field) before = data
              else if (removedCard && before) before[field] = data
              else if (removedItem && before) { const card = before.quiz?.cards?.find(c => c.id === image.card_id); if (card) card[field] = data }
            }
          }
          applyOperation(state, op, tombstones)
          if (op.path[0] === 'trackingState') touched.add(Number(op.path[2]))
          await client.query(`INSERT INTO user_sync_operations(user_id,operation_id,request_hash,operation,previous_value,previous_exists,version)
            VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)`, [userId, op.id, hash, JSON.stringify(op), JSON.stringify(before ?? null), before !== undefined, version])
        }
        const next = applyOperations(state, [])
        await store.commitOperations(client, userId, row, next, version, new Date().toISOString(), pending.map(p => p.op))
        for (const path of tombstones) if (!oldTombstones.has(path)) await client.query('INSERT INTO user_sync_tombstones(user_id,path) VALUES($1,$2) ON CONFLICT DO NOTHING', [userId, path])
        for (const path of oldTombstones) if (!tombstones.has(path)) await client.query('DELETE FROM user_sync_tombstones WHERE user_id=$1 AND path=$2', [userId, path])
        await client.query('INSERT INTO user_sync_commits(user_id,version,items) VALUES($1,$2,$3::jsonb)', [userId, version, JSON.stringify([...touched])])
      }
      return snapshot(client, userId, since, operations.map(op => op.id))
    })
  }

  async function history(userId, before) {
    const rows = (await pool.query(`SELECT sequence,operation_id,operation,previous_value,previous_exists,created_at
      FROM user_sync_operations WHERE user_id=$1 AND sequence<$2 ORDER BY sequence DESC LIMIT 50`, [userId, before || '9223372036854775807'])).rows
    return { entries: rows, next: rows.at(-1)?.sequence || null }
  }
  async function restore(userId, operationId, requestId, since) {
    const row = (await pool.query('SELECT operation,previous_value,previous_exists FROM user_sync_operations WHERE user_id=$1 AND operation_id=$2', [userId, operationId])).rows[0]
    if (!row) throw new StateError(404, 'HISTORY_MISSING', 'Modification introuvable.')
    if (!['set', 'delete', 'create', 'restore'].includes(row.operation.type)) throw new StateError(400, 'HISTORY_EVENT', 'Une révision est conservée comme événement.')
    return write(userId, [{ id: requestId, type: row.previous_exists ? 'restore' : 'delete', path: row.operation.path,
      ...(row.previous_exists ? { value: row.previous_value } : {}) }], since)
  }
  return { init, read, write, history, restore, receipts }
}

export function mountAutomaticSync(app, { sync, authenticate, enforceClientVersion, limiter, decorate, refresh }) {
  const uid = (req, res) => { const auth = authenticate(req); if (!auth) res.status(401).json({ error: 'Session expirée.' }); else res.locals.syncToken = refresh?.(res, auth); return auth ? Number(auth.uid) : null }
  const respond = (res, result) => { if (result.state) result.state.trackingState = decorate(result.state.trackingState, result.images || [], { metadataOnly: true }); delete result.images; res.json({ ...result, ...(res.locals.syncToken ? { token: res.locals.syncToken } : {}) }) }
  app.get('/api/sync', enforceClientVersion, async (req, res) => { const user = uid(req, res); if (user) respond(res, await sync.read(user, req.query.since === undefined ? undefined : Number(req.query.since))) })
  app.post('/api/sync', enforceClientVersion, limiter, async (req, res) => { const user = uid(req, res); if (user) respond(res, await sync.write(user, req.body.operations, req.body.since)) })
  app.post('/api/sync/receipts', enforceClientVersion, limiter, async (req, res) => { const user = uid(req, res); if (user) respond(res, await sync.receipts(user, req.body.ids)) })
  app.get('/api/sync/history', enforceClientVersion, async (req, res) => { const user = uid(req, res); if (user) res.json(await sync.history(user, req.query.before)) })
  app.post('/api/sync/history/:operationId/restore', enforceClientVersion, limiter, async (req, res) => { const user = uid(req, res); if (user) respond(res, await sync.restore(user, req.params.operationId, req.body.requestId, req.body.since)) })
}
