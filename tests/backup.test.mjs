import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises'
import { encryptArchive, decryptArchive, backupKey } from '../scripts/backup/archive.mjs'
import { configurePitr } from '../scripts/neon-pitr.mjs'
import { pgEnvironment } from '../scripts/backup/postgres.mjs'

test('encrypted archive round trips, rejects corruption and removes unauthenticated plaintext', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'itemstracker-crypto-test-'))
  try {
    const key = crypto.randomBytes(32), source = path.join(directory, 'source'), encrypted = path.join(directory, 'encrypted'), target = path.join(directory, 'target')
    await writeFile(source, crypto.randomBytes(120000))
    await encryptArchive(source, encrypted, key)
    assert.equal((await stat(encrypted)).mode & 0o777, 0o600)
    await decryptArchive(encrypted, target, key)
    assert.deepEqual(await readFile(source), await readFile(target))
    const corrupted = await readFile(encrypted); corrupted[25] ^= 1
    await writeFile(encrypted, corrupted)
    await assert.rejects(decryptArchive(encrypted, path.join(directory, 'invalid'), key), /Authentification/)
    await assert.rejects(stat(path.join(directory, 'invalid')), { code: 'ENOENT' })
    await assert.rejects(decryptArchive(encrypted, path.join(directory, 'wrongkey'), crypto.randomBytes(32)), /Authentification/)
    assert.throws(() => backupKey('invalid'), /32 octets/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
test('PITR change uses documented project field and verifies applied retention', async () => {
  const calls = [], env = { NEON_PROJECT_ID: 'test-project', NEON_API_KEY: 'local-test-key', NEON_PITR_DAYS: '7' }
  let retention = 86400
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body })
    if (options.method === 'PATCH') retention = JSON.parse(options.body).project.history_retention_seconds
    return { ok: true, json: async () => ({ project: { history_retention_seconds: retention } }) }
  }
  const dry = await configurePitr({ env, fetchImpl })
  assert.equal(dry.applied, false); assert.deepEqual(calls.map(c => c.method), ['GET'])
  calls.length = 0
  const applied = await configurePitr({ env, apply: true, fetchImpl })
  assert.equal(applied.retentionDays, 7); assert.deepEqual(calls.map(c => c.method), ['GET', 'PATCH', 'GET'])
  assert.deepEqual(JSON.parse(calls[1].body), { project: { history_retention_seconds: 604800 } })
  retention = 30 * 86400; calls.length = 0
  assert.equal((await configurePitr({ env, apply: true, fetchImpl })).alreadyProtected, true)
  assert.deepEqual(calls.map(c => c.method), ['GET'])
})
test('PITR rejects unconfirmed changes and never upgrades an offer', async () => {
  const env = { NEON_PROJECT_ID: 'test-project', NEON_API_KEY: 'test' }
  const notApplied = async () => ({ ok: true, json: async () => ({ project: { history_retention_seconds: 0 } }) })
  await assert.rejects(configurePitr({ env, apply: true, fetchImpl: notApplied }), /pas été confirmé/)
  await assert.rejects(configurePitr({ env, apply: true, fetchImpl: async () => ({ ok: false, status: 400 }) }), /aucune offre ne sera changée/)
})
test('pg_dump receives credentials via environment without password in command arguments', () => {
  const env = pgEnvironment('postgresql://user:p%40ss@localhost:5433/db?sslmode=disable')
  assert.equal(env.PGPASSWORD, 'p@ss'); assert.equal(env.PGPORT, '5433'); assert.equal(env.PGDATABASE, 'db')
})
