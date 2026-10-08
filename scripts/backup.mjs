import 'dotenv/config'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createReadStream } from 'node:fs'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, chmod } from 'node:fs/promises'
import pg from 'pg'
import { createMediaStore } from '../server/media-store.mjs'
import { createStateStore } from '../server/state-store.mjs'
import { collectMediaGarbage } from './backup/media-gc.mjs'
import { backupKey, encryptArchive, decryptArchive } from './backup/archive.mjs'
import { pgEnvironment, databaseIdentity, run } from './backup/postgres.mjs'
const digest = body => crypto.createHash('sha256').update(body).digest('hex')
async function fileDigest(file) {
  const hash = crypto.createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}
const poolFor = url => new pg.Pool({ connectionString: url, ssl: /^(localhost|127\.0\.0\.1)$/.test(new URL(url).hostname) ? false : { rejectUnauthorized: true } })

export async function makeBackup(env = process.env) {
  const connection = env.BACKUP_DATABASE_URL || env.DATABASE_URL
  if (!connection) throw new Error('BACKUP_DATABASE_URL manquant (connexion directe, sans pooler).')
  if (new URL(connection).hostname.includes('-pooler.')) throw new Error('La sauvegarde nécessite une connexion Neon directe, sans pooler.')
  if (!env.BACKUP_DIRECTORY || !path.isAbsolute(env.BACKUP_DIRECTORY)) throw new Error('BACKUP_DIRECTORY doit désigner un répertoire absolu, hors du site public.')
  const key = backupKey(env.BACKUP_ENCRYPTION_KEY)
  const directory = await mkdtemp(path.join(os.tmpdir(), 'itemstracker-backup-'))
  const pool = poolFor(connection), client = await pool.connect()
  let destination
  try {
    await mkdir(path.join(directory, 'media'), { mode: 0o700 })
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const snapshot = (await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id
    const hasMedia = (await client.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_quiz_images' AND column_name='object_key'")).rowCount > 0
    const rows = hasMedia ? (await client.query(`SELECT DISTINCT object_key,mime_type FROM user_quiz_images WHERE object_key IS NOT NULL
      UNION SELECT DISTINCT m->>'object_key',m->>'mime_type' FROM user_state_snapshots,
      LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(state->'media')='array' THEN state->'media' ELSE '[]'::jsonb END) m WHERE m->>'object_key' IS NOT NULL`)).rows : []
    const mediaStore = createMediaStore(env)
    if (rows.length && !mediaStore) throw new Error('Le backup complet nécessite les accès MEDIA_S3 des objets référencés.')
    const media = []
    for (const row of rows) {
      const dataUrl = await mediaStore.read(row)
      const body = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
      const file = `media/${digest(row.object_key)}`
      await writeFile(path.join(directory, file), body, { mode: 0o600, flag: 'wx' })
      media.push({ key: row.object_key, mime: row.mime_type, file, sha256: digest(body), bytes: body.length })
    }
    const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows
    const counts = {}
    for (const { tablename } of tables) {
      if (!/^[a-z_][a-z0-9_]*$/.test(tablename)) throw new Error('Nom de table non pris en charge.')
      counts[tablename] = Number((await client.query(`SELECT COUNT(*) AS n FROM "${tablename}"`)).rows[0].n)
    }
    await run(env.PG_DUMP_PATH || 'pg_dump', ['--format=custom', '--no-owner', '--no-acl', `--snapshot=${snapshot}`, '--file', path.join(directory, 'database.dump')], pgEnvironment(connection))
    const dumpSha256 = await fileDigest(path.join(directory, 'database.dump'))
    const manifest = { format: 1, applicationVersion: '0.1.0', createdAt: new Date().toISOString(),
      pgVersion: (await client.query('SHOW server_version')).rows[0].server_version,
      dumpSha256, counts, media }
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 })
    await client.query('COMMIT')
    await run('tar', ['-czf', path.join(directory, 'archive.tar.gz'), '-C', directory, 'database.dump', 'manifest.json', 'media'])
    await mkdir(env.BACKUP_DIRECTORY, { recursive: true, mode: 0o700 }); await chmod(env.BACKUP_DIRECTORY, 0o700)
    destination = path.join(env.BACKUP_DIRECTORY, `itemstracker-${new Date().toISOString().replaceAll(':', '-')}-${crypto.randomUUID().slice(0, 8)}.itbackup`)
    await encryptArchive(path.join(directory, 'archive.tar.gz'), destination, key)
    // Verify authentication and hashes before counting the archive as a success.
    const verified = await inspectBackup(destination, env)
    if (verified.dumpSha256 !== manifest.dumpSha256) throw new Error('Vérification de sauvegarde impossible.')
    await writeFile(`${destination}.ok.json`, JSON.stringify({ createdAt: manifest.createdAt, dumpSha256: manifest.dumpSha256, mediaCount: media.length }), { mode: 0o600, flag: 'wx' })
    await retainBackups(env.BACKUP_DIRECTORY)
    let maintenance = { ok: true }
    // Purge is run after a verified backup; pre-migration tables also supported.
    if (hasMedia) {
      try { await createStateStore(pool, { env }).pruneHistory(); await collectMediaGarbage(pool, env) }
      catch (error) { maintenance = { ok: false, error: error.message } }
    }
    return { file: destination, mediaCount: media.length, counts, maintenance }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    if (destination) { await rm(destination, { force: true }); await rm(`${destination}.ok.json`, { force: true }) }
    throw error
  } finally { client.release(); await pool.end(); await rm(directory, { recursive: true, force: true }) }
}
async function extractBackup(file, directory, env) {
  const archive = path.join(directory, 'archive.tar.gz')
  await decryptArchive(file, archive, backupKey(env.BACKUP_ENCRYPTION_KEY))
  const entries = (await run('tar', ['-tzf', archive])).trim().split('\n')
  if (!entries.every(entry => /^(database\.dump|manifest\.json|media\/?|media\/[a-f0-9]{64})$/.test(entry))) throw new Error('Contenu d’archive invalide.')
  await run('tar', ['-xzf', archive, '-C', directory])
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'))
  if (manifest.format !== 1 || !Array.isArray(manifest.media) || !manifest.counts) throw new Error('Manifeste invalide.')
  if (await fileDigest(path.join(directory, 'database.dump')) !== manifest.dumpSha256) throw new Error('Dump PostgreSQL corrompu.')
  for (const media of manifest.media) {
    if (!/^media\/[a-f0-9]{64}$/.test(media.file) || digest(await readFile(path.join(directory, media.file))) !== media.sha256) throw new Error('Média de sauvegarde corrompu.')
  }
  await run(env.PG_RESTORE_PATH || 'pg_restore', ['--list', path.join(directory, 'database.dump')])
  return manifest
}
export async function inspectBackup(file, env = process.env) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'itemstracker-verify-'))
  try { return await extractBackup(file, directory, env) }
  finally { await rm(directory, { recursive: true, force: true }) }
}
export async function restoreBackup(file, env = process.env) {
  const target = env.RESTORE_DATABASE_URL
  if (!target) throw new Error('RESTORE_DATABASE_URL manquant : utiliser une base vide et isolée.')
  if (env.DATABASE_URL && databaseIdentity(target) === databaseIdentity(env.DATABASE_URL)) throw new Error('La restauration dans la base applicative est refusée.')
  if (env.BACKUP_DATABASE_URL && databaseIdentity(target) === databaseIdentity(env.BACKUP_DATABASE_URL)) throw new Error('La restauration dans la base source est refusée.')
  const directory = await mkdtemp(path.join(os.tmpdir(), 'itemstracker-restore-'))
  const pool = poolFor(target)
  try {
    const manifest = await extractBackup(file, directory, env) // Authentication precedes any database mutation.
    const tables = await pool.query("SELECT 1 FROM pg_tables WHERE schemaname='public' LIMIT 1")
    if (tables.rowCount) throw new Error('La base de restauration doit être vide. Aucune table existante ne sera supprimée.')
    const targetMediaEnv = { ...env, MEDIA_S3_BUCKET: env.RESTORE_MEDIA_S3_BUCKET, MEDIA_S3_ACCESS_KEY_ID: env.RESTORE_MEDIA_S3_ACCESS_KEY_ID,
      MEDIA_S3_SECRET_ACCESS_KEY: env.RESTORE_MEDIA_S3_SECRET_ACCESS_KEY, MEDIA_S3_ENDPOINT: env.RESTORE_MEDIA_S3_ENDPOINT, MEDIA_S3_REGION: env.RESTORE_MEDIA_S3_REGION }
    const mediaStore = createMediaStore(targetMediaEnv)
    if (manifest.media.length && (!mediaStore || mediaStore.bucket === env.MEDIA_S3_BUCKET)) throw new Error('La restauration des images nécessite un bucket RESTORE_MEDIA_S3 distinct du bucket applicatif.')
    if (manifest.media.length) {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3')
      for (const media of manifest.media) await mediaStore.client.send(new PutObjectCommand({ Bucket: mediaStore.bucket, Key: media.key,
        Body: await readFile(path.join(directory, media.file)), ContentType: media.mime }))
    }
    await run(env.PG_RESTORE_PATH || 'pg_restore', ['--single-transaction', '--exit-on-error', '--no-owner', '--no-acl', '--dbname', new URL(target).pathname.slice(1), path.join(directory, 'database.dump')], pgEnvironment(target))
    for (const [table, expected] of Object.entries(manifest.counts)) {
      if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error('Nom de table invalide dans le manifeste.')
      if (Number((await pool.query(`SELECT COUNT(*) AS n FROM "${table}"`)).rows[0].n) !== expected) throw new Error(`Comptage incohérent pour ${table}.`)
    }
    return { verified: true, counts: manifest.counts, mediaCount: manifest.media.length }
  } finally { await pool.end(); await rm(directory, { recursive: true, force: true }) }
}
export async function retainBackups(directory, now = Date.now()) {
  const names = (await readdir(directory)).filter(name => /^itemstracker-.*\.itbackup$/.test(name)).sort().reverse()
  const daily = new Set(), weekly = new Set(), keep = new Set()
  for (const name of names) {
    let marker
    try { marker = JSON.parse(await readFile(path.join(directory, `${name}.ok.json`), 'utf8')) } catch { continue }
    const time = Date.parse(marker.createdAt)
    if (!Number.isFinite(time)) continue
    const day = Math.floor(time / 86400000), week = Math.floor((day + 3) / 7)
    if (daily.size < 7 && now - time < 7 * 86400000 && !daily.has(day)) { keep.add(name); daily.add(day) }
    if (weekly.size < 4 && now - time < 28 * 86400000 && !weekly.has(week)) { keep.add(name); weekly.add(week) }
  }
  // Never delete the only verified backup, even if the scheduler was stopped.
  const newest = names.find(name => keep.has(name))
  if (!newest) return
  for (const name of names) {
    if (keep.has(name)) continue
    try { await readFile(path.join(directory, `${name}.ok.json`)) } catch { continue }
    await rm(path.join(directory, name)); await rm(path.join(directory, `${name}.ok.json`))
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] || 'create'
  const action = mode === 'create' ? () => makeBackup() : mode === 'verify' ? () => inspectBackup(process.argv[3]) : mode === 'restore' ? () => restoreBackup(process.argv[3]) : null
  if (!action) throw new Error('Usage : node scripts/backup.mjs create|verify <archive>|restore <archive>')
  action().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1 })
}
