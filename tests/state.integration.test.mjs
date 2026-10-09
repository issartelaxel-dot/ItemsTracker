import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import jwt from 'jsonwebtoken'
import { createStateStore } from '../server/state-store.mjs'
import { makeBackup, inspectBackup, restoreBackup } from '../scripts/backup.mjs'
import { collectMediaGarbage } from '../scripts/backup/media-gc.mjs'
import { access } from 'node:fs/promises'
import { defaultState } from '../server/state-model.mjs'

export async function freePort() {
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
const secret = 'local-test-secret-only-01234567890123456789'
const image = 'data:image/png;base64,aGVsbG8='
let cluster, pool, api, server, directory, store, connectionString
const user = async () => Number((await pool.query("INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,'Test','unused',$2) RETURNING id", [`${crypto.randomUUID()}@example.test`, new Date().toISOString()])).rows[0].id)
const state = () => ({ ...defaultState(), dateFormat: 'iso', timeZone: 'Europe/Paris', shuffleQuizCards: true,
  trackingState: { items: { 1: { label: 'One', quiz: { cards: [{ id: 'a', answer: 'old' }, { id: 'b', answer: 'B' }] } },
    2: { label: 'Two', quiz: { cards: [{ id: 'c', answer: 'C' }] } } } } })
async function request(uid, method, suffix, body, version = '0.1.0') {
  const response = await fetch(`${api}${suffix}`, { method,
    headers: { Authorization: `Bearer ${jwt.sign({ uid, email: 'test@example.test' }, secret, { expiresIn: '45m' })}`, 'Content-Type': 'application/json', 'x-client-version': version },
    ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: response.status, body: await response.json() }
}
const full = (uid, payload = state(), baseVersion = 0, id = crypto.randomUUID()) => request(uid, 'PUT', '/api/state', { ...payload, baseVersion, requestId: id })

test.before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'itemstracker-state-test-'))
  const port = await freePort()
  cluster = new EmbeddedPostgres({ databaseDir: path.join(directory, 'pg'), port, user: 'postgres', password: 'local-only', persistent: false,
    postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} })
  await cluster.initialise(); await cluster.start()
  connectionString = `postgresql://postgres:local-only@127.0.0.1:${port}/postgres`
  pool = new pg.Pool({ connectionString })
  const apiPort = await freePort()
  api = `http://127.0.0.1:${apiPort}`
  let output = ''
  server = spawn(process.execPath, ['--max-old-space-size=128', 'server/index.mjs'], { env: { ...process.env, DATABASE_URL: connectionString, JWT_SECRET: secret, PORT: String(apiPort),
    BOOTSTRAP_EMAIL: '', BOOTSTRAP_PASSWORD: '', MEDIA_S3_BUCKET: '', APP_VERSION: '0.1.0', MIN_CLIENT_VERSION: '0.1.0', STORAGE_LIMIT_BYTES: '2097152', STATE_WRITE_LIMIT_PER_MIN: '10000' }, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', data => { output += data }); server.stderr.on('data', data => { output += data })
  for (let attempt = 0; attempt < 200; attempt++) {
    if (server.exitCode !== null) throw new Error(output)
    try { if ((await fetch(`${api}/api/health`)).ok) break } catch { await delay(50) }
    if (attempt === 199) throw new Error(`Server failed to start: ${output}`)
  }
  store = createStateStore(pool)
})
test.after(async () => {
  if (server?.exitCode === null && server?.signalCode === null) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)) }
  if (pool) await pool.end()
  if (cluster) await cluster.stop()
  if (directory) await rm(directory, { recursive: true, force: true })
})

test('two concurrent first saves: one commits and the other returns a conflict', async () => {
  const uid = await user()
  const outcomes = await Promise.all([full(uid), full(uid, { ...state(), theme: 'dark' })])
  assert.deepEqual(outcomes.map(x => x.status).sort(), [200, 409])
  assert.equal(outcomes.find(x => x.status === 409).body.code, 'STATE_CONFLICT')
  assert.equal((await request(uid, 'GET', '/api/state')).body.version, 1)
  assert.equal((await pool.query('SELECT COUNT(*) FROM user_state_idempotency WHERE user_id=$1', [uid])).rows[0].count, '1')
})
test('lost acknowledgement replays exactly once; reused ID with a different body is rejected', async () => {
  const uid = await user(), id = crypto.randomUUID()
  const first = await full(uid, state(), 0, id)
  const retry = await full(uid, state(), 0, id)
  assert.equal(retry.status, 200)
  assert.equal(retry.body.version, first.body.version)
  assert.equal((await full(uid, { ...state(), theme: 'dark' }, 0, id)).body.code, 'IDEMPOTENCY_MISMATCH')
  assert.equal((await pool.query('SELECT COUNT(*) FROM user_state_snapshots WHERE user_id=$1', [uid])).rows[0].count, '1')
})
test('sparse item patch rewrites only the changed card and preserves other items/preferences', async () => {
  const uid = await user(); await full(uid)
  const before = await pool.query('SELECT item_number,card_id,xmin::text FROM user_quiz_cards WHERE user_id=$1 ORDER BY card_id', [uid])
  const result = await request(uid, 'PATCH', '/api/state', { baseVersion: 1, requestId: crypto.randomUUID(), patch: {
    trackingState: { items: { 1: { quiz: { cards: [{ id: 'a', answer: 'changed' }, { id: 'b', answer: 'B', frontImageDataUrl: '', backImageDataUrl: '', imageDataUrl: '' }] } } } } } })
  assert.equal(result.status, 200, JSON.stringify(result.body))
  const after = await pool.query('SELECT item_number,card_id,xmin::text FROM user_quiz_cards WHERE user_id=$1 ORDER BY card_id', [uid])
  assert.notEqual(after.rows[0].xmin, before.rows[0].xmin)
  assert.equal(after.rows[1].xmin, before.rows[1].xmin)
  assert.equal(after.rows[2].xmin, before.rows[2].xmin)
  const loaded = (await request(uid, 'GET', '/api/state')).body.state
  assert.equal(loaded.trackingState.items[2].label, 'Two')
  assert.equal(loaded.dateFormat, 'iso'); assert.equal(loaded.shuffleQuizCards, true)
  assert.deepEqual((await pool.query('SELECT tracking_state FROM user_state WHERE user_id=$1', [uid])).rows[0].tracking_state, {})
})
test('image writes bump version; deleting a card cleans images and counters', async () => {
  const uid = await user(); await full(uid)
  const body = { baseVersion: 1, requestId: crypto.randomUUID(), upsert: [{ itemNumber: 1, cardId: 'a', imageSlot: 'front', imageDataUrl: image }], removed: [] }
  const saved = await request(uid, 'POST', '/api/state/images', body)
  assert.equal(saved.status, 200, JSON.stringify(saved.body)); assert.equal(saved.body.version, 2)
  assert.equal((await request(uid, 'POST', '/api/state/images', body)).body.version, 2)
  assert.equal((await request(uid, 'GET', '/api/state/images/1/a')).body.frontImageDataUrl, image)
  const usage = (await request(uid, 'GET', '/api/storage-usage')).body
  assert.equal(usage.counts.images, 1); assert.equal(usage.breakdown.imagesBytes, 5)
  const deletion = await request(uid, 'PATCH', '/api/state', { baseVersion: 2, requestId: crypto.randomUUID(), patch: { trackingState: { items: { 1: null } } } })
  assert.equal(deletion.status, 200)
  assert.equal((await request(uid, 'GET', '/api/storage-usage')).body.counts.images, 0)
})
test('over-quota save rolls back all items, media and idempotency rows', async () => {
  const uid = await user(); await full(uid)
  const before = (await request(uid, 'GET', '/api/state')).body
  const result = await request(uid, 'PATCH', '/api/state', { baseVersion: 1, requestId: crypto.randomUUID(), patch: { trackingState: { items: { 1: { label: 'x'.repeat(2_100_000) } } } } })
  assert.equal(result.status, 413)
  const after = (await request(uid, 'GET', '/api/state')).body
  assert.equal(after.version, before.version); assert.deepEqual(after.state, before.state)
  assert.equal((await pool.query('SELECT COUNT(*) FROM user_state_idempotency WHERE user_id=$1', [uid])).rows[0].count, '1')
})
test('legacy migration preserves embedded images, version and card order; avatar removal works', async () => {
  const uid = await user(), legacy = state()
  legacy.trackingState.items[1].quiz.cards[0].backImageDataUrl = image
  legacy.profile = { photoUrl: image, firstName: 'Old' }
  await pool.query("INSERT INTO user_state(user_id,tracking_state,theme,focus_mode,youtube_mode,profile,updated_at,version) VALUES($1,$2,'dark',true,'external',$3,$4,7)", [uid, legacy.trackingState, legacy.profile, new Date().toISOString()])
  const result = (await request(uid, 'GET', '/api/state')).body
  assert.equal(result.version, 7); assert.equal(result.state.profile.photoUrl, image)
  assert.deepEqual(result.state.trackingState.items[1].quiz.cards.map(c => c.id), ['a', 'b'])
  assert.equal(result.state.trackingState.items[1].quiz.cards[0].backImageDataUrl, image)
  assert.equal((await pool.query('SELECT storage_version FROM user_state WHERE user_id=$1', [uid])).rows[0].storage_version, 2)
  const removed = await request(uid, 'PATCH', '/api/state', { baseVersion: 7, requestId: crypto.randomUUID(), patch: { profile: { photoUrl: '' } } })
  assert.equal(removed.status, 200, JSON.stringify(removed.body))
  assert.equal((await request(uid, 'GET', '/api/state')).body.state.profile.photoUrl, '')
})
test('large legacy images migrate under a 128 MiB Node heap without being loaded as one JSON payload', async () => {
  const uid = await user(), cardCount = 32, imageSize = 3 * 1024 * 1024
  try {
    // Construct 96 MiB in PostgreSQL, keeping the test runner's heap small too.
    await pool.query(`INSERT INTO user_state(user_id,tracking_state,theme,focus_mode,youtube_mode,profile,updated_at,version)
      SELECT $1,jsonb_build_object('items',jsonb_build_object('1',jsonb_build_object('label','Heavy legacy',
        'quiz',jsonb_build_object('cards',jsonb_agg(jsonb_build_object('id','card-' || n,'answer','Answer ' || n,
          'imageDataUrl','data:image/png;base64,' || repeat('a',$2))))))),
        'light',false,'embed','null'::jsonb,$3,9 FROM generate_series(1,$4) n`,
      [uid, imageSize, new Date().toISOString(), cardCount])
    const result = await request(uid, 'GET', '/api/state?imageMode=metadata')
    assert.equal(result.status, 200, JSON.stringify(result.body))
    assert.equal(result.body.version, 9)
    assert.equal(result.body.state.profile, null)
    assert.ok(JSON.stringify(result.body).length < 50_000)
    assert.equal(result.body.state.trackingState.items[1].quiz.cards.length, cardCount)
    assert.deepEqual(result.body.state.trackingState.items[1].quiz.cards.map(c => c.id), Array.from({ length: cardCount }, (_, n) => `card-${n + 1}`))
    assert.equal(result.body.state.trackingState.items[1].quiz.cards[0].hasBackImageDataUrl, true)
    const stored = (await pool.query(`SELECT
      (SELECT storage_version FROM user_state WHERE user_id=$1) AS version,
      (SELECT COUNT(*) FROM user_quiz_images WHERE user_id=$1 AND image_data='' AND blob_key IS NOT NULL) AS images,
      (SELECT COUNT(*) FROM user_media_blobs WHERE user_id=$1) AS blobs,
      (SELECT SUM(octet_length(image_data)) FROM user_media_blobs WHERE user_id=$1) AS bytes`, [uid])).rows[0]
    assert.equal(stored.version, 2)
    assert.equal(Number(stored.images), cardCount)
    assert.equal(Number(stored.blobs), 1)
    assert.equal(Number(stored.bytes), imageSize + 'data:image/png;base64,'.length)
    const loaded = await request(uid, 'GET', '/api/state/images/1/card-1')
    assert.equal(loaded.status, 200)
    assert.equal(loaded.body.backImageDataUrl.length, imageSize + 'data:image/png;base64,'.length)
    const health = await fetch(`${api}/api/health`)
    assert.equal(health.status, 200)
    assert.equal((await health.json()).stateMigration, 'sql-media-v1')
  } finally { await pool.query('DELETE FROM users WHERE id=$1', [uid]) }
})

test('private immutable media storage keeps bytes out of SQL and snapshots', async () => {
  const uid = await user(), blobs = new Map()
  const privateStore = createStateStore(pool, { mediaStore: { async put(id, parsed) { const key = `${id}/${parsed.hash}`; blobs.set(key, parsed.body); return key },
    async read(row) { return `data:${row.mime_type};base64,${blobs.get(row.object_key).toString('base64')}` } } })
  const initial = state(); initial.trackingState.items[1].quiz.cards[0].backImageDataUrl = image
  await privateStore.write(uid, 'state-full', { ...initial, baseVersion: 0, requestId: crypto.randomUUID() })
  const row = (await pool.query('SELECT image_data,object_key FROM user_quiz_images WHERE user_id=$1', [uid])).rows[0]
  assert.equal(row.image_data, ''); assert.ok(row.object_key)
  const saved = await privateStore.read(uid, { metadataOnly: false })
  assert.equal(saved.images[0].image_data, image)
  const snapshot = (await pool.query('SELECT state FROM user_state_snapshots WHERE user_id=$1', [uid])).rows[0].state
  assert.equal(snapshot.media[0].image_data, null); assert.equal(snapshot.media[0].object_key, row.object_key)
})
test('daily retention prunes technical rows, while keeping active data and recent snapshots', async () => {
  const uid = await user(); await full(uid)
  const old = new Date(Date.now() - 40 * 86400000).toISOString()
  await pool.query('INSERT INTO user_state_snapshots(user_id,version,state,created_at) VALUES($1,0,$2,$3)', [uid, {}, old])
  await pool.query("INSERT INTO user_state_idempotency(user_id,endpoint,request_id,response,created_at) VALUES($1,'state-full','old-request',$2,$3)", [uid, {}, old])
  const result = await store.pruneHistory({ force: true })
  assert.ok(result.user_state_snapshots >= 1); assert.ok(result.user_state_idempotency >= 1)
  assert.equal((await request(uid, 'GET', '/api/state')).body.version, 1)
  assert.equal((await pool.query('SELECT COUNT(*) FROM user_state_snapshots WHERE user_id=$1', [uid])).rows[0].count, '1')
})
test('old clients cannot write; session refresh executes without a database lookup', async () => {
  const uid = await user()
  assert.equal((await request(uid, 'PUT', '/api/state', { ...state() }, '0.0.0')).status, 426)
  assert.equal((await request(uid, 'PUT', '/api/state', state())).body.code, 'SAVE_PROTOCOL_REQUIRED')
  assert.equal((await request(uid, 'GET', '/api/session')).status, 200)
  // Token renewal remains possible without the user row, but reads/writes verify it.
  await pool.query('DELETE FROM users WHERE id=$1', [uid])
  assert.equal((await request(uid, 'GET', '/api/session')).status, 200)
  assert.equal((await request(uid, 'GET', '/api/state')).status, 401)
})


test('complete encrypted pg_dump restores into an isolated empty database with image blobs', async () => {
  const dumpPath = process.env.PG_DUMP_PATH || (process.platform === 'darwin' ? '/opt/homebrew/opt/libpq@18/bin/pg_dump' : 'pg_dump')
  const restorePath = process.env.PG_RESTORE_PATH || (process.platform === 'darwin' ? '/opt/homebrew/opt/libpq@18/bin/pg_restore' : 'pg_restore')
  if (dumpPath.startsWith('/')) await access(dumpPath)
  const uid = await user(); const payload = state()
  payload.trackingState.items[1].quiz.cards[0].frontImageDataUrl = image
  await full(uid, payload)
  // Fake private S3 media belongs only to the earlier fixture; remove that user
  // before making a complete fallback-SQL archive without external credentials.
  const objectUsers = (await pool.query('SELECT DISTINCT user_id FROM user_quiz_images WHERE object_key IS NOT NULL')).rows
  for (const row of objectUsers) await pool.query('DELETE FROM users WHERE id=$1', [row.user_id])
  await pool.query('CREATE DATABASE restore_test')
  const target = new URL(connectionString); target.pathname = '/restore_test'
  const env = { BACKUP_DATABASE_URL: connectionString, DATABASE_URL: connectionString, RESTORE_DATABASE_URL: target.href,
    BACKUP_DIRECTORY: path.join(directory, 'encrypted-backups'), BACKUP_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    PG_DUMP_PATH: dumpPath, PG_RESTORE_PATH: restorePath }
  const archive = await makeBackup(env)
  const manifest = await inspectBackup(archive.file, env)
  assert.ok(manifest.counts.user_media_blobs >= 1)
  assert.equal(JSON.stringify(manifest).includes('local-only'), false)
  const restored = await restoreBackup(archive.file, env)
  assert.equal(restored.verified, true)
  const restoredPool = new pg.Pool({ connectionString: target.href })
  try {
    const restoredStore = createStateStore(restoredPool)
    assert.equal((await restoredStore.cardImages(uid, 1, 'a')).frontImageDataUrl, image)
    assert.deepEqual((await restoredStore.read(uid)).state.trackingState, (await store.read(uid)).state.trackingState)
  } finally { await restoredPool.end() }
  await assert.rejects(restoreBackup(archive.file, env), /doit être vide/)
  await assert.rejects(restoreBackup(archive.file, { ...env, RESTORE_DATABASE_URL: connectionString }), /base applicative/)
})

test('snapshots share immutable SQL media blobs instead of repeating base64', async () => {
  const uid = await user(), payload = state()
  payload.trackingState.items[1].quiz.cards[0].backImageDataUrl = image
  await full(uid, payload)
  await pool.query("UPDATE user_state SET last_snapshot_at='2000-01-01T00:00:00.000Z' WHERE user_id=$1", [uid])
  await request(uid, 'PATCH', '/api/state', { baseVersion: 1, requestId: crypto.randomUUID(), patch: { theme: 'dark' } })
  const snapshots = (await pool.query('SELECT state FROM user_state_snapshots WHERE user_id=$1', [uid])).rows
  assert.equal(snapshots.length, 2)
  assert.ok(snapshots.every(row => row.state.media[0].blob_key))
  assert.ok(snapshots.every(row => !JSON.stringify(row.state).includes(image)))
  assert.equal((await pool.query('SELECT COUNT(*) FROM user_media_blobs WHERE user_id=$1', [uid])).rows[0].count, '1')
})


test('object GC starts retention at retirement and preserves current/snapshot references', async () => {
  const uid = await user(), deleted = []
  const mediaStore = { prefix: 'itemstracker/media', client: { async send(command) { deleted.push(command.input.Key) } }, bucket: 'local-test',
    async put(id, parsed) { return `itemstracker/media/${id}/${parsed.hash}` }, async read() { return image } }
  const privateStore = createStateStore(pool, { mediaStore })
  const initial = state(); initial.trackingState.items[1].quiz.cards[0].backImageDataUrl = image
  await privateStore.write(uid, 'state-full', { ...initial, baseVersion: 0, requestId: crypto.randomUUID() })
  const originalKey = (await pool.query('SELECT object_key FROM user_quiz_images WHERE user_id=$1', [uid])).rows[0].object_key
  await privateStore.write(uid, 'state-images', { baseVersion: 1, requestId: crypto.randomUUID(), upsert: [{ itemNumber: 1, cardId: 'a', imageSlot: 'back', imageDataUrl: 'data:image/png;base64,d29ybGQ=' }] })
  const env = { MEDIA_GC_ENABLED: 'true', MEDIA_GC_RETENTION_DAYS: '45' }
  assert.equal((await collectMediaGarbage(pool, env, { mediaStore })).removed, 0)
  await pool.query("UPDATE media_gc_candidates SET retired_at=NOW()-interval '50 days' WHERE object_key=$1", [originalKey])
  assert.equal((await collectMediaGarbage(pool, env, { mediaStore })).removed, 0, 'snapshot reference still protects the old media')
  await pool.query('DELETE FROM user_state_snapshots WHERE user_id=$1', [uid])
  assert.equal((await collectMediaGarbage(pool, env, { mediaStore })).removed, 1)
  assert.deepEqual(deleted, [originalKey])
  const currentKey = (await pool.query('SELECT object_key FROM user_quiz_images WHERE user_id=$1', [uid])).rows[0].object_key
  await pool.query("INSERT INTO media_gc_candidates(object_key,retired_at) VALUES($1,NOW()-interval '50 days')", [currentKey])
  assert.equal((await collectMediaGarbage(pool, env, { mediaStore })).removed, 0, 'current reference always protects media')
})
