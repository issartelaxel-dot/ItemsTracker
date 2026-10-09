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
import argon2 from 'argon2'

let directory, cluster, pool, backend, smtp, api, failNextMail = false
const messages = []
const sockets = new Set()
const password = 'A-valid-password-123!'
async function freePort() {
  const socket = net.createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  return port
}
async function request(route, body) {
  const response = await fetch(`${api}/api/auth/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') }
}
const lastCode = () => messages.at(-1).body.match(/\b\d{6}\b/)[0]
async function signup(email) {
  const response = await request('register/request', { email, password, firstName: 'Test', lastName: 'User' })
  assert.equal(response.status, 200, JSON.stringify(response.body))
  return { email: email.trim().toLowerCase(), verificationToken: response.body.verificationToken, code: lastCode() }
}
async function allowResend(email) {
  await pool.query('UPDATE signup_requests SET created_at=$1 WHERE email=$2', [new Date(Date.now() - 61_000).toISOString(), email])
}

test.before(async () => {
  // Real SMTP protocol, confined to loopback: no e-mail ever leaves the test.
  smtp = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket))
    socket.write('220 localhost test SMTP\r\n')
    let buffer = '', data = null, recipient = ''
    socket.on('data', chunk => {
      buffer += chunk.toString()
      let position
      while ((position = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, position); buffer = buffer.slice(position + 2)
        if (data !== null) {
          if (line !== '.') { data.push(line); continue }
          if (failNextMail) { failNextMail = false; socket.write('550 temporary test failure\r\n') }
          else { messages.push({ recipient, body: data.join('\n') }); socket.write('250 accepted\r\n') }
          data = null
        } else if (/^EHLO|^HELO/.test(line)) socket.write('250-localhost\r\n250 AUTH PLAIN\r\n')
        else if (/^AUTH/.test(line)) socket.write('235 authenticated\r\n')
        else if (/^RCPT TO:/.test(line)) { recipient = line; socket.write('250 ok\r\n') }
        else if (/^DATA/.test(line)) { data = []; socket.write('354 send message\r\n') }
        else if (/^QUIT/.test(line)) socket.end('221 bye\r\n')
        else socket.write('250 ok\r\n')
      }
    })
  })
  await new Promise(resolve => smtp.listen(0, '127.0.0.1', resolve))
  directory = await mkdtemp(path.join(os.tmpdir(), 'itemstracker-registration-'))
  const port = await freePort()
  cluster = new EmbeddedPostgres({ databaseDir: path.join(directory, 'pg'), port, user: 'postgres', password: 'test-only', persistent: false,
    postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} })
  await cluster.initialise(); await cluster.start()
  const connectionString = `postgresql://postgres:test-only@127.0.0.1:${port}/postgres`
  pool = new pg.Pool({ connectionString })
  const apiPort = await freePort(); api = `http://127.0.0.1:${apiPort}`
  let output = ''
  backend = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env,
    DATABASE_URL: connectionString, JWT_SECRET: 'test-registration-secret-only-01234567890123456789', PORT: String(apiPort), NODE_ENV: 'test',
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.address().port), SMTP_USER: 'local-test', SMTP_PASS: 'local-test', SMTP_FROM: 'test@local.invalid',
    BOOTSTRAP_EMAIL: '', BOOTSTRAP_PASSWORD: '', MEDIA_S3_BUCKET: '', COOKIE_SECURE: 'false',
  }, stdio: ['ignore', 'pipe', 'pipe'] })
  backend.stdout.on('data', data => { output += data }); backend.stderr.on('data', data => { output += data })
  for (let attempt = 0; attempt < 200; attempt++) {
    if (backend.exitCode !== null) throw new Error(output)
    try { if ((await fetch(`${api}/api/health`)).ok) return } catch { await delay(50) }
  }
  throw new Error(`Backend failed to start: ${output}`)
})
test.after(async () => {
  if (backend?.exitCode === null) { backend.kill('SIGTERM'); await new Promise(resolve => backend.once('exit', resolve)) }
  if (pool) await pool.end()
  if (cluster) await cluster.stop()
  for (const socket of sockets) socket.destroy()
  if (smtp?.listening) await new Promise(resolve => smtp.close(resolve))
  if (directory) await rm(directory, { recursive: true, force: true })
})

test('six-digit code goes to the user; account exists only after verification; concurrent consumption is single-use', async () => {
  const config = await fetch(`${api}/api/auth/register/config`)
  assert.deepEqual(await config.json(), { method: 'email', codeLength: 6 })
  const challenge = await signup(' New.User@example.test ')
  assert.match(challenge.code, /^\d{6}$/)
  assert.match(messages.at(-1).recipient, /new.user@example.test/)
  assert.equal((await pool.query('SELECT id FROM users WHERE email=$1', [challenge.email])).rowCount, 0)
  const row = (await pool.query('SELECT * FROM signup_requests WHERE email=$1', [challenge.email])).rows[0]
  assert.notEqual(row.code_hash, challenge.code)
  assert.notEqual(row.verification_token_hash, challenge.verificationToken)
  assert.ok(await argon2.verify(row.password_hash, password))
  const results = await Promise.all([request('register/verify', challenge), request('register/verify', challenge)])
  assert.deepEqual(results.map(result => result.status).sort(), [200, 400])
  assert.match(results.find(result => result.status === 200).cookie, /med_auth=/)
  assert.ok(results.find(result => result.status === 200).body.token)
  assert.equal((await pool.query('SELECT id FROM users WHERE email=$1', [challenge.email])).rowCount, 1)
  assert.equal((await request('login', { email: challenge.email, password })).status, 200)
})

test('wrong registration token and eight-digit codes cannot create accounts', async () => {
  const challenge = await signup('bound@example.test')
  assert.equal((await request('register/verify', { ...challenge, verificationToken: 'a'.repeat(64) })).status, 400)
  assert.equal((await request('register/verify', { ...challenge, code: '12345678' })).status, 400)
  assert.equal((await pool.query('SELECT id FROM users WHERE email=$1', [challenge.email])).rowCount, 0)
})

test('five concurrent incorrect attempts exhaust the challenge without lost increments', async () => {
  const challenge = await signup('attempts@example.test')
  const code = challenge.code === '000000' ? '000001' : '000000'
  const outcomes = await Promise.all(Array.from({ length: 5 }, () => request('register/verify', { ...challenge, code })))
  assert.deepEqual(outcomes.map(result => result.status).sort(), [400, 400, 400, 400, 429])
  assert.equal((await request('register/verify', challenge)).status, 400)
  assert.equal((await pool.query('SELECT id FROM users WHERE email=$1', [challenge.email])).rowCount, 0)
})

test('resend respects cooldown, replaces code and preserves the remaining attempt budget', async () => {
  const challenge = await signup('resend@example.test')
  const wrong = challenge.code === '000000' ? '000001' : '000000'
  await request('register/verify', { ...challenge, code: wrong })
  const count = messages.length
  assert.equal((await request('register/resend', challenge)).status, 429)
  assert.equal((await request('register/request', { email: challenge.email, password })).status, 429)
  assert.equal(messages.length, count)
  await allowResend(challenge.email)
  assert.equal((await request('register/resend', challenge)).status, 200)
  const code = lastCode()
  assert.equal((await pool.query('SELECT attempts FROM signup_requests WHERE email=$1', [challenge.email])).rows[0].attempts, 1)
  if (code !== challenge.code) assert.equal((await request('register/verify', challenge)).status, 400)
  assert.equal((await request('register/verify', { ...challenge, code })).status, 200)
})

test('expired codes cannot create users; resend starts a fresh validity period', async () => {
  const challenge = await signup('expired@example.test')
  await pool.query('UPDATE signup_requests SET expires_at=$1 WHERE email=$2', [Date.now() - 1, challenge.email])
  assert.equal((await request('register/verify', challenge)).status, 400)
  await allowResend(challenge.email)
  assert.equal((await request('register/resend', challenge)).status, 200)
  assert.equal((await request('register/verify', { ...challenge, code: lastCode() })).status, 200)
})

test('SMTP failures roll back pending requests and failed resends preserve the previous code', async () => {
  failNextMail = true
  assert.equal((await request('register/request', { email: 'failure@example.test', password })).status, 503)
  assert.equal((await pool.query("SELECT * FROM signup_requests WHERE email='failure@example.test'")).rowCount, 0)
  const challenge = await signup('failure@example.test')
  await allowResend(challenge.email)
  failNextMail = true
  assert.equal((await request('register/resend', challenge)).status, 503)
  assert.equal((await request('register/verify', challenge)).status, 200)
})

test('existing accounts cannot be overwritten; password reset still uses its existing eight-digit flow', async () => {
  assert.equal((await request('register/request', { email: 'new.user@example.test', password })).status, 409)
  assert.equal((await request('password/request', { email: 'new.user@example.test' })).status, 200)
  const code = messages.at(-1).body.match(/\b\d{8}\b/)[0]
  assert.equal((await request('password/confirm', { email: 'new.user@example.test', code, newPassword: 'New-valid-password-321!' })).status, 200)
  assert.equal((await request('login', { email: 'new.user@example.test', password: 'New-valid-password-321!' })).status, 200)
})
