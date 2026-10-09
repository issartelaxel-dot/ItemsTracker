import crypto from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { StateError, persistSchema, defaultState, mergePatch, splitItem, extractMedia, bytes, imageKey, assertSafeObject } from './state-model.mjs'
import { parseImage, readMedia } from './media-store.mjs'

const DAY = 86_400_000
const META_SQL = `SELECT tracking_state AS "trackingState", theme, focus_mode AS "focusMode",
  youtube_mode AS "youtubeDisplayMode", profile, preferences, updated_at AS "updatedAt",
  version, last_snapshot_at AS "lastSnapshotAt", storage_version AS "storageVersion",
  data_bytes AS "dataBytes", media_bytes AS "mediaBytes", media_count AS "mediaCount"
  FROM user_state WHERE user_id = $1`

function duration(value, fallback, minimum) {
  const n = Number(value)
  if (value === undefined || value === '') return fallback
  if (!Number.isFinite(n) || n < minimum) throw new Error('Durée de rétention invalide.')
  return n
}

export function createStateStore(pool, { mediaStore = null, env = process.env } = {}) {
  const limit = Number(env.STORAGE_LIMIT_BYTES || 2 * 1024 ** 3)
  const imageLimit = Number(env.STATE_MAX_TOTAL_IMAGES_PER_USER || 5000)
  const snapshotDays = duration(env.STATE_SNAPSHOT_RETENTION_DAYS, 30, 1)
  const idempotencyHours = duration(env.STATE_IDEMPOTENCY_RETENTION_HOURS, 72, 24)
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(imageLimit) || imageLimit < 1) throw new Error('Quota de stockage invalide.')

  async function init() {
    await pool.query(`
      ALTER TABLE user_state ADD COLUMN IF NOT EXISTS storage_version INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE user_state ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}';
      ALTER TABLE user_state ADD COLUMN IF NOT EXISTS data_bytes BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE user_state ADD COLUMN IF NOT EXISTS media_bytes BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE user_state ADD COLUMN IF NOT EXISTS media_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE user_state_idempotency ADD COLUMN IF NOT EXISTS request_hash TEXT;
      ALTER TABLE user_quiz_images ADD COLUMN IF NOT EXISTS object_key TEXT;
      ALTER TABLE user_quiz_images ADD COLUMN IF NOT EXISTS mime_type TEXT;
      ALTER TABLE user_quiz_images ADD COLUMN IF NOT EXISTS image_bytes BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE user_quiz_images ADD COLUMN IF NOT EXISTS content_hash TEXT;
      ALTER TABLE user_quiz_images ADD COLUMN IF NOT EXISTS blob_key TEXT;
      CREATE TABLE IF NOT EXISTS user_media_blobs (
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blob_key TEXT NOT NULL, image_data TEXT NOT NULL,
        PRIMARY KEY(user_id,blob_key)
      );
      CREATE TABLE IF NOT EXISTS media_gc_candidates (object_key TEXT PRIMARY KEY, retired_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS user_tracking_items (
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_number INTEGER NOT NULL,
        data JSONB NOT NULL,
        PRIMARY KEY(user_id, item_number)
      );
      CREATE TABLE IF NOT EXISTS user_quiz_cards (
        user_id BIGINT NOT NULL, item_number INTEGER NOT NULL, card_id TEXT NOT NULL,
        position INTEGER NOT NULL, data JSONB NOT NULL,
        PRIMARY KEY(user_id, item_number, card_id),
        FOREIGN KEY(user_id, item_number) REFERENCES user_tracking_items(user_id, item_number) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_state_snapshots_created ON user_state_snapshots(created_at);
      CREATE TABLE IF NOT EXISTS backup_maintenance (name TEXT PRIMARY KEY, last_run_at TIMESTAMPTZ NOT NULL);
    `)
  }

  async function transaction(userId, work) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      // Le verrou sur users existe même avant la toute première sauvegarde.
      const user = await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId])
      if (!user.rows.length) throw new StateError(401, 'USER_MISSING', 'Compte introuvable.')
      await migrate(client, userId)
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally { client.release() }
  }

  function payload(row) {
    if (!row) return defaultState()
    return { ...defaultState(), ...row.preferences, trackingState: row.trackingState,
      theme: row.theme, focusMode: row.focusMode, youtubeDisplayMode: row.youtubeDisplayMode, profile: row.profile }
  }

  async function load(client, userId, itemNumbers = null) {
    const row = (await client.query(META_SQL, [userId])).rows[0]
    if (!row) return null
    const suffix = itemNumbers === null ? '' : ' AND item_number = ANY($2::integer[])'
    const params = itemNumbers === null ? [userId] : [userId, itemNumbers]
    const items = await client.query(`SELECT item_number, data FROM user_tracking_items WHERE user_id = $1${suffix}`, params)
    const cards = await client.query(`SELECT item_number, data FROM user_quiz_cards WHERE user_id = $1${suffix} ORDER BY position, card_id`, params)
    row.trackingState = { ...row.trackingState, items: Object.fromEntries(items.rows.map(r => [r.item_number, r.data])) }
    for (const card of cards.rows) {
      const item = row.trackingState.items[card.item_number]
      if (item?.quiz) item.quiz.cards.push(card.data)
    }
    return row
  }

  async function persistItems(client, userId, previous, next, selected = null) {
    let delta = 0
    const keys = selected === null ? new Set([...Object.keys(previous.items), ...Object.keys(next.items)]) : new Set(selected.map(String))
    for (const key of keys) {
      const before = previous.items[key]
      const after = next.items[key]
      if (isDeepStrictEqual(before, after)) continue
      if (after === undefined) {
        delta -= bytes(splitItem(before).data) + splitItem(before).cards.reduce((n, card) => n + bytes(card), 0)
        await client.query('DELETE FROM user_tracking_items WHERE user_id = $1 AND item_number = $2', [userId, Number(key)])
        continue
      }
      const old = before ? splitItem(before) : { data: null, cards: [] }
      const current = splitItem(after)
      if (!isDeepStrictEqual(old.data, current.data)) {
        delta += bytes(current.data) - (old.data ? bytes(old.data) : 0)
        await client.query(`INSERT INTO user_tracking_items(user_id,item_number,data) VALUES($1,$2,$3::jsonb)
          ON CONFLICT(user_id,item_number) DO UPDATE SET data = EXCLUDED.data`, [userId, Number(key), JSON.stringify(current.data)])
      }
      const oldCards = new Map(old.cards.map((card, i) => [card.id, { card, position: i }]))
      const currentIds = new Set(current.cards.map(card => card.id))
      for (const [id, entry] of oldCards) if (!currentIds.has(id)) {
        delta -= bytes(entry.card)
        await client.query('DELETE FROM user_quiz_cards WHERE user_id=$1 AND item_number=$2 AND card_id=$3', [userId, Number(key), id])
      }
      for (const [position, card] of current.cards.entries()) {
        const entry = oldCards.get(card.id)
        if (entry && isDeepStrictEqual(entry.card, card) && entry.position === position) continue
        delta += bytes(card) - (entry ? bytes(entry.card) : 0)
        if (entry && isDeepStrictEqual(entry.card, card)) {
          await client.query('UPDATE user_quiz_cards SET position=$4 WHERE user_id=$1 AND item_number=$2 AND card_id=$3', [userId, Number(key), card.id, position])
        } else {
          await client.query(`INSERT INTO user_quiz_cards(user_id,item_number,card_id,position,data) VALUES($1,$2,$3,$4,$5::jsonb)
            ON CONFLICT(user_id,item_number,card_id) DO UPDATE SET data=EXCLUDED.data, position=EXCLUDED.position`, [userId, Number(key), card.id, position, JSON.stringify(card)])
        }
      }
    }
    return delta
  }

  function header(state) {
    const { items: _items, ...root } = state.trackingState
    return { ...state, trackingState: root }
  }

  async function persistHead(client, userId, state, version, updatedAt, dataBytes, snapshotAt) {
    const h = header(state)
    const preferences = { dateFormat: h.dateFormat, timeZone: h.timeZone, shuffleQuizCards: h.shuffleQuizCards }
    await client.query(`INSERT INTO user_state(user_id,tracking_state,theme,focus_mode,youtube_mode,profile,preferences,
      updated_at,version,last_snapshot_at,storage_version,data_bytes)
      VALUES($1,$2::jsonb,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,2,$11)
      ON CONFLICT(user_id) DO UPDATE SET tracking_state=EXCLUDED.tracking_state,theme=EXCLUDED.theme,
      focus_mode=EXCLUDED.focus_mode,youtube_mode=EXCLUDED.youtube_mode,profile=EXCLUDED.profile,
      preferences=EXCLUDED.preferences,updated_at=EXCLUDED.updated_at,version=EXCLUDED.version,
      last_snapshot_at=EXCLUDED.last_snapshot_at,storage_version=2,data_bytes=EXCLUDED.data_bytes`,
    [userId, JSON.stringify(h.trackingState), h.theme, h.focusMode, h.youtubeDisplayMode, JSON.stringify(h.profile),
      JSON.stringify(preferences), updatedAt, version, snapshotAt, dataBytes])
  }

  async function syncMedia(client, userId, upsert = [], removed = [], { legacy = false } = {}) {
    if (!upsert.length && !removed.length) return { upserted: 0, removed: 0, changed: false }
    const head = (await client.query(META_SQL, [userId])).rows[0]
    const keys = [...upsert, ...removed].map(entry => ({ item_number: entry.itemNumber, card_id: entry.cardId, image_slot: entry.imageSlot || 'back' }))
    const oldRows = await client.query(`SELECT i.* FROM user_quiz_images i JOIN jsonb_to_recordset($2::jsonb)
      AS k(item_number integer,card_id text,image_slot text) USING(item_number,card_id,image_slot)
      WHERE i.user_id=$1`, [userId, JSON.stringify(keys)])
    const old = new Map(oldRows.rows.map(row => [imageKey({ itemNumber: row.item_number, cardId: row.card_id, imageSlot: row.image_slot }), row]))
    const changes = new Map()
    for (const entry of removed) changes.set(imageKey(entry), { ...entry, remove: true })
    for (const entry of upsert) {
      const parsed = legacy ? { hash: crypto.createHash('sha256').update(entry.imageDataUrl).digest('hex'), body: Buffer.from(entry.imageDataUrl), mime: '' } : parseImage(entry.imageDataUrl)
      changes.set(imageKey(entry), { ...entry, parsed })
    }
    let count = Number(head.mediaCount), total = Number(head.mediaBytes), changed = false, upserted = 0, removedCount = 0
    for (const [key, entry] of changes) {
      const existing = old.get(key)
      if (entry.remove) { if (existing) { count--; total -= Number(existing.image_bytes) } }
      else if (!existing || (existing.content_hash !== entry.parsed.hash && existing.image_data !== entry.imageDataUrl)) { if (!existing) count++; total += entry.parsed.body.length - Number(existing?.image_bytes || 0) }
    }
    if (!legacy && ((count > imageLimit && count > Number(head.mediaCount)) || (total + Number(head.dataBytes) > limit && total > Number(head.mediaBytes)))) throw new StateError(413, 'STORAGE_QUOTA', 'Quota de stockage dépassé.')
    for (const [key, entry] of changes) {
      const existing = old.get(key)
      if (entry.remove) {
        if (!existing) continue
        await retireObject(client, existing.object_key)
        await client.query('DELETE FROM user_quiz_images WHERE user_id=$1 AND item_number=$2 AND card_id=$3 AND image_slot=$4', [userId, entry.itemNumber, entry.cardId, entry.imageSlot || 'back'])
        changed = true; removedCount++; continue
      }
      if (existing && (existing.content_hash === entry.parsed.hash || existing.image_data === entry.imageDataUrl) && (!mediaStore || legacy || existing.object_key)) continue
      const objectKey = mediaStore && !legacy ? await mediaStore.put(userId, entry.parsed) : null
      const blobKey = objectKey ? null : `${entry.parsed.mime}:${entry.parsed.hash}`
      if (blobKey) await client.query('INSERT INTO user_media_blobs(user_id,blob_key,image_data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [userId, blobKey, entry.imageDataUrl])
      if (existing?.object_key && existing.object_key !== objectKey) await retireObject(client, existing.object_key)
      await client.query(`INSERT INTO user_quiz_images(user_id,item_number,card_id,image_slot,image_data,updated_at,object_key,mime_type,image_bytes,content_hash,blob_key)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(user_id,item_number,card_id,image_slot) DO UPDATE SET
        image_data=EXCLUDED.image_data,updated_at=EXCLUDED.updated_at,object_key=EXCLUDED.object_key,
        mime_type=EXCLUDED.mime_type,image_bytes=EXCLUDED.image_bytes,content_hash=EXCLUDED.content_hash,blob_key=EXCLUDED.blob_key`,
      [userId, entry.itemNumber, entry.cardId, entry.imageSlot || 'back', '',
        new Date().toISOString(), objectKey, entry.parsed.mime, entry.parsed.body.length, entry.parsed.hash, blobKey])
      changed = true; upserted++
    }
    if (changed) await client.query('UPDATE user_state SET media_bytes=$2,media_count=$3 WHERE user_id=$1', [userId, total, count])
    return { upserted, removed: removedCount, total: count, changed }
  }

  async function retireObject(client, key) {
    if (key) await client.query('INSERT INTO media_gc_candidates(object_key,retired_at) VALUES($1,NOW()) ON CONFLICT(object_key) DO UPDATE SET retired_at=NOW()', [key])
  }

  async function migrate(client, userId) {
    // Never ask pg to deserialize the legacy JSON/image collection into Node's heap.
    const status = (await client.query('SELECT storage_version FROM user_state WHERE user_id=$1', [userId])).rows[0]
    if (!status || Number(status.storage_version) === 2) return
    const row = (await client.query(META_SQL.replace('tracking_state AS', "(tracking_state - 'items') AS")
      .replace('profile, preferences', `CASE WHEN profile IS NULL OR jsonb_typeof(profile)='null' THEN NULL
        WHEN profile->>'photoUrl' LIKE 'data:%'
        THEN (profile || '{"photoUrl":"","hasPhoto":true,"password":""}'::jsonb)
        ELSE profile || '{"password":""}'::jsonb END AS profile, preferences`), [userId])).rows[0]
    const cleanCard = `c.card - 'frontImageDataUrl' - 'backImageDataUrl' - 'imageDataUrl'
      || '{"frontImageDataUrl":"","backImageDataUrl":"","imageDataUrl":""}'::jsonb
      || CASE WHEN COALESCE(c.card->>'frontImageDataUrl','')<>'' THEN '{"hasFrontImageDataUrl":true}'::jsonb ELSE '{}'::jsonb END
      || CASE WHEN COALESCE(NULLIF(c.card->>'backImageDataUrl',''),c.card->>'imageDataUrl','')<>''
        THEN '{"hasBackImageDataUrl":true}'::jsonb ELSE '{}'::jsonb END`
    const items = await client.query(`SELECT i.key, CASE WHEN i.value ? 'quiz' THEN
      jsonb_set(i.value, '{quiz,cards}', COALESCE((SELECT jsonb_agg(${cleanCard} ORDER BY c.position)
        FROM jsonb_array_elements(COALESCE(i.value->'quiz'->'cards','[]'::jsonb)) WITH ORDINALITY AS c(card,position)), '[]'::jsonb))
      ELSE i.value END AS data
      FROM user_state s CROSS JOIN LATERAL jsonb_each(s.tracking_state->'items') i WHERE s.user_id=$1`, [userId])
    row.trackingState.items = Object.fromEntries(items.rows.map(item => [item.key, item.data]))
    const original = payload(row)
    assertSafeObject(original)
    const { state } = extractMedia(persistSchema.parse(original))

    // Extract original image bytes in PostgreSQL before replacing the legacy state.
    await client.query(`WITH sources AS (
      SELECT i.key::integer AS item_number, c.card->>'id' AS card_id, slot AS image_slot,
        CASE WHEN slot='front' THEN COALESCE(c.card->>'frontImageDataUrl','')
          ELSE COALESCE(NULLIF(c.card->>'backImageDataUrl',''),c.card->>'imageDataUrl','') END AS image_data
      FROM user_state s CROSS JOIN LATERAL jsonb_each(s.tracking_state->'items') i
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(i.value->'quiz'->'cards','[]'::jsonb)) c(card)
      CROSS JOIN (VALUES ('front'),('back')) slots(slot) WHERE s.user_id=$1
      UNION ALL SELECT 0,'__profile__','back',profile->>'photoUrl' FROM user_state
        WHERE user_id=$1 AND profile->>'photoUrl' LIKE 'data:%'
    ) INSERT INTO user_quiz_images(user_id,item_number,card_id,image_slot,image_data,updated_at,image_bytes)
      SELECT $1,item_number,card_id,image_slot,image_data,$2,octet_length(image_data) FROM sources WHERE image_data<>''
      ON CONFLICT(user_id,item_number,card_id,image_slot) DO UPDATE SET image_data=EXCLUDED.image_data,
        updated_at=EXCLUDED.updated_at,image_bytes=EXCLUDED.image_bytes,object_key=NULL,blob_key=NULL,content_hash=NULL`,
    [userId, new Date().toISOString()])
    // Deduplicate without returning any base64 strings to the JavaScript process.
    await client.query(`INSERT INTO user_media_blobs(user_id,blob_key,image_data)
      SELECT user_id,'legacy:' || encode(sha256(convert_to(image_data,'UTF8')),'hex'),image_data
      FROM user_quiz_images WHERE user_id=$1 AND object_key IS NULL AND image_data<>''
      ON CONFLICT DO NOTHING`, [userId])
    await client.query(`UPDATE user_quiz_images SET
      blob_key='legacy:' || encode(sha256(convert_to(image_data,'UTF8')),'hex'),
      content_hash=encode(sha256(convert_to(image_data,'UTF8')),'hex'),
      image_bytes=octet_length(image_data),image_data=''
      WHERE user_id=$1 AND object_key IS NULL AND image_data<>''`, [userId])
    const delta = await persistItems(client, userId, { items: {} }, state.trackingState)
    await persistHead(client, userId, state, Number(row.version), row.updatedAt, bytes(header(state)) + delta, row.lastSnapshotAt)
    const media = (await client.query('SELECT COALESCE(SUM(image_bytes),0) AS bytes, COUNT(*)::integer AS count FROM user_quiz_images WHERE user_id=$1', [userId])).rows[0]
    await client.query('UPDATE user_state SET media_bytes=$2,media_count=$3 WHERE user_id=$1', [userId, media.bytes, media.count])
  }

  async function read(userId, { metadataOnly = true } = {}) {
    // Le verrou utilisateur empêche les écritures applicatives de mélanger les versions.
    const result = await transaction(userId, async client => {
      const row = await load(client, userId)
      if (!row) return { state: null, version: 0 }
      const images = await client.query(metadataOnly
        ? "SELECT item_number,card_id,image_slot,content_hash,updated_at FROM user_quiz_images WHERE user_id=$1 AND item_number<>0"
        : `SELECT i.*,COALESCE(NULLIF(i.image_data,''),b.image_data,'') AS image_data FROM user_quiz_images i LEFT JOIN user_media_blobs b USING(user_id,blob_key) WHERE i.user_id=$1 AND i.item_number<>0`, [userId])
      const avatar = await client.query(`SELECT i.*,COALESCE(NULLIF(i.image_data,''),b.image_data,'') AS image_data FROM user_quiz_images i LEFT JOIN user_media_blobs b USING(user_id,blob_key) WHERE i.user_id=$1 AND i.item_number=0 AND i.card_id='__profile__'`, [userId])
      return { state: { ...payload(row), updatedAt: row.updatedAt }, version: Number(row.version), images: images.rows, avatar: avatar.rows[0] }
    })
    if (result.avatar && result.state?.profile) result.state.profile.photoUrl = await readMedia(result.avatar, mediaStore)
    if (!metadataOnly) for (const image of result.images || []) image.image_data = await readMedia(image, mediaStore)
    return result
  }

  async function cardImages(userId, itemNumber, cardId) {
    const rows = await pool.query(`SELECT i.*,COALESCE(NULLIF(i.image_data,''),b.image_data,'') AS image_data FROM user_quiz_images i LEFT JOIN user_media_blobs b USING(user_id,blob_key) WHERE i.user_id=$1 AND i.item_number=$2 AND i.card_id=$3`, [userId, itemNumber, cardId])
    const result = { frontImageDataUrl: '', backImageDataUrl: '' }
    for (const row of rows.rows) result[row.image_slot === 'front' ? 'frontImageDataUrl' : 'backImageDataUrl'] = await readMedia(row, mediaStore)
    return result
  }

  let nextMaintenanceAt = 0
  async function write(userId, kind, body) {
    if (!Number.isSafeInteger(body.baseVersion) || body.baseVersion < 0 || typeof body.requestId !== 'string' || body.requestId.length < 6 || body.requestId.length > 120) {
      throw new StateError(400, 'SAVE_PROTOCOL_REQUIRED', 'Version et identifiant de sauvegarde requis. Recharge l’application.')
    }
    assertSafeObject(body)
    const hash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')
    const result = await transaction(userId, async client => {
      const replay = (await client.query('SELECT response,request_hash FROM user_state_idempotency WHERE user_id=$1 AND endpoint=$2 AND request_id=$3', [userId, kind, body.requestId])).rows[0]
      if (replay) {
        if (replay.request_hash && replay.request_hash !== hash) throw new StateError(409, 'IDEMPOTENCY_MISMATCH', 'Identifiant déjà utilisé pour une autre sauvegarde.')
        return replay.response
      }
      const meta = (await client.query(META_SQL, [userId])).rows[0]
      const version = Number(meta?.version || 0)
      if (body.baseVersion !== version) throw new StateError(409, 'STATE_CONFLICT', 'État modifié dans une autre session.', version)
      if (!meta) await persistHead(client, userId, defaultState(), 0, new Date().toISOString(), bytes(header(defaultState())), null)
      const now = new Date().toISOString()
      let changed = false, mediaResult
      if (kind === 'state-images') {
        // Vérifier que les cartes appartiennent à cet utilisateur ; aucun média orphelin injecté.
        for (const entry of body.upsert || []) {
          const exists = await client.query('SELECT 1 FROM user_quiz_cards WHERE user_id=$1 AND item_number=$2 AND card_id=$3', [userId, entry.itemNumber, entry.cardId])
          if (!exists.rows.length) throw new StateError(400, 'CARD_MISSING', 'Carte introuvable pour cette image.')
        }
        mediaResult = await syncMedia(client, userId, body.upsert, body.removed)
        changed = mediaResult.changed
        if (changed) await client.query('UPDATE user_state SET updated_at=$2,version=version+1 WHERE user_id=$1', [userId, now])
      } else {
        const itemsPatch = body.patch?.trackingState?.items
        const selected = kind === 'state-patch' && (!body.patch?.trackingState || (itemsPatch && typeof itemsPatch === 'object' && !Array.isArray(itemsPatch)))
          ? Object.keys(itemsPatch || {}).map(Number) : null
        if (selected?.some(n => !Number.isInteger(n) || n < 1 || n > 9999)) throw new StateError(400, 'INVALID_ITEM', 'Numéro d’item invalide.')
        const row = await load(client, userId, selected)
        const previous = payload(row)
        const merged = kind === 'state-patch' ? mergePatch(previous, body.patch) : body
        const parsed = persistSchema.safeParse(merged)
        if (!parsed.success) throw new StateError(400, 'INVALID_STATE', 'État de sauvegarde invalide.')
        const { state, upsert } = extractMedia(parsed.data)
        const removed = []
        // L'avatar est lui aussi stocké hors du gros document de profil.
        const explicitProfile = kind === 'state-patch' ? body.patch?.profile : body.profile
        const photoRemoved = explicitProfile === null || (explicitProfile && Object.hasOwn(explicitProfile, 'photoUrl') && !explicitProfile.photoUrl)
        if (photoRemoved && row?.profile?.hasPhoto) {
          if (state.profile) state.profile.hasPhoto = false
        }
        if (photoRemoved && row?.profile?.hasPhoto) removed.push({ itemNumber: 0, cardId: '__profile__', imageSlot: 'back' })
        const delta = await persistItems(client, userId, previous.trackingState, state.trackingState, selected)
        const dataBytes = Number(row?.dataBytes || 0) + delta + bytes(header(state)) - bytes(header(previous))
        // Nettoyer les images de cartes supprimées, sans détruire les objets immuables.
        const orphaned = await client.query(`DELETE FROM user_quiz_images i WHERE i.user_id=$1 AND i.item_number<>0
          AND NOT EXISTS (SELECT 1 FROM user_quiz_cards c WHERE c.user_id=i.user_id AND c.item_number=i.item_number AND c.card_id=i.card_id)
          RETURNING image_bytes,object_key`, [userId])
        for (const image of orphaned.rows) await retireObject(client, image.object_key)
        if (orphaned.rowCount) await client.query('UPDATE user_state SET media_bytes=media_bytes-$2,media_count=media_count-$3 WHERE user_id=$1',
          [userId, orphaned.rows.reduce((sum, r) => sum + Number(r.image_bytes), 0), orphaned.rowCount])
        await client.query('UPDATE user_state SET data_bytes=$2 WHERE user_id=$1', [userId, dataBytes])
        mediaResult = await syncMedia(client, userId, upsert, removed)
        const finalHead = (await client.query(META_SQL, [userId])).rows[0]
        const finalBytes = dataBytes + Number(finalHead.mediaBytes)
        if (finalBytes > limit && finalBytes > Number(row?.dataBytes || 0) + Number(row?.mediaBytes || 0)) throw new StateError(413, 'STORAGE_QUOTA', 'Quota de stockage dépassé.')
        changed = !isDeepStrictEqual(previous, state) || mediaResult.changed || orphaned.rowCount > 0
        if (changed) await persistHead(client, userId, state, version + 1, now, dataBytes, row?.lastSnapshotAt || null)
      }
      if (changed) {
        const last = (await client.query(META_SQL, [userId])).rows[0]
        if (!last.lastSnapshotAt || Date.now() - Date.parse(last.lastSnapshotAt) >= DAY) {
          const snapshot = payload(await load(client, userId))
          const media = (await client.query('SELECT item_number,card_id,image_slot,object_key,mime_type,content_hash,blob_key,NULL AS image_data FROM user_quiz_images WHERE user_id=$1', [userId])).rows
          await client.query('INSERT INTO user_state_snapshots(user_id,version,state,created_at) VALUES($1,$2,$3::jsonb,$4)', [userId, version + 1, JSON.stringify({ ...snapshot, media }), now])
          await client.query('UPDATE user_state SET last_snapshot_at=$2 WHERE user_id=$1', [userId, now])
        }
      }
      const imageVersions = kind === 'state-images' ? Object.fromEntries((await client.query('SELECT item_number,card_id,image_slot,content_hash,updated_at FROM user_quiz_images WHERE user_id=$1', [userId])).rows.map(r => [`${r.item_number}:${r.card_id}:${r.image_slot}`, r.content_hash || r.updated_at])) : {}
      const response = { ok: true, updatedAt: changed ? now : meta?.updatedAt || now, version: changed ? version + 1 : version,
        ...(kind === 'state-images' ? { upserted: mediaResult.upserted, removed: mediaResult.removed, total: mediaResult.total, imageVersions } : {}) }
      await client.query(`INSERT INTO user_state_idempotency(user_id,endpoint,request_id,response,created_at,request_hash)
        VALUES($1,$2,$3,$4::jsonb,$5,$6)`, [userId, kind, body.requestId, JSON.stringify(response), now, hash])
      return response
    })
    // Une seule maintenance quotidienne, déclenchée par une écriture réelle.
    // Aucun minuteur SQL ne maintient Neon éveillé pendant l'inactivité.
    if (Date.now() >= nextMaintenanceAt) {
      nextMaintenanceAt = Date.now() + DAY
      await pruneHistory().catch(error => { nextMaintenanceAt = Date.now() + 3_600_000; console.error('History maintenance failed:', error.message) })
    }
    return result
  }

  async function storageUsage(userId) {
    return transaction(userId, async client => {
      const row = (await client.query(META_SQL, [userId])).rows[0]
      const history = (await client.query(`SELECT
        (SELECT COALESCE(SUM(octet_length(state::text)),0) FROM user_state_snapshots WHERE user_id=$1) AS snapshots,
        (SELECT COUNT(*) FROM user_state_snapshots WHERE user_id=$1) AS snapshot_count,
        (SELECT COALESCE(SUM(octet_length(response::text)),0) FROM user_state_idempotency WHERE user_id=$1) AS idempotency,
        (SELECT COUNT(*) FROM user_state_idempotency WHERE user_id=$1) AS idempotency_count`, [userId])).rows[0]
      const currentStateBytes = Number(row?.dataBytes || 0), imagesBytes = Number(row?.mediaBytes || 0)
      const snapshotsBytes = Number(history.snapshots), idempotencyBytes = Number(history.idempotency)
      return { usedBytes: currentStateBytes + imagesBytes, limitBytes: limit, measuredAt: new Date().toISOString(),
        measurement: 'logical-current-data', historyBytes: snapshotsBytes + idempotencyBytes,
        breakdown: { currentStateBytes, imagesBytes, snapshotsBytes, idempotencyBytes },
        counts: { images: Number(row?.mediaCount || 0), snapshots: Number(history.snapshot_count), idempotencyEntries: Number(history.idempotency_count) } }
    })
  }

  async function pruneHistory({ force = false } = {}) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query("INSERT INTO backup_maintenance(name,last_run_at) VALUES('history','1970-01-01') ON CONFLICT DO NOTHING")
      const last = (await client.query("SELECT last_run_at FROM backup_maintenance WHERE name='history' FOR UPDATE")).rows[0]
      if (!force && Date.now() - new Date(last.last_run_at).getTime() < DAY) { await client.query('COMMIT'); return { skipped: true } }
      await client.query('SELECT id FROM users ORDER BY id FOR UPDATE')
      const cutoffs = [new Date(Date.now() - snapshotDays * DAY).toISOString(), new Date(Date.now() - idempotencyHours * 3_600_000).toISOString()]
      const counts = {}
      for (const [i, table] of ['user_state_snapshots', 'user_state_idempotency'].entries()) {
        let total = 0, count
        do {
          const deleted = await client.query(`DELETE FROM ${table} WHERE ctid IN (SELECT ctid FROM ${table} WHERE created_at<$1 LIMIT 1000)`, [cutoffs[i]])
          count = deleted.rowCount; total += count
        } while (count === 1000)
        counts[table] = total
      }
      counts.user_media_blobs = (await client.query(`DELETE FROM user_media_blobs b WHERE
        NOT EXISTS (SELECT 1 FROM user_quiz_images i WHERE i.user_id=b.user_id AND i.blob_key=b.blob_key)
        AND NOT EXISTS (SELECT 1 FROM user_state_snapshots s,
          LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.state->'media')='array' THEN s.state->'media' ELSE '[]'::jsonb END) m
          WHERE s.user_id=b.user_id AND m->>'blob_key'=b.blob_key)`)).rowCount
      await client.query("UPDATE backup_maintenance SET last_run_at=NOW() WHERE name='history'")
      await client.query('COMMIT')
      return counts
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error }
    finally { client.release() }
  }

  return { init, read, write, cardImages, storageUsage, pruneHistory, transaction, load, mediaStore }
}
