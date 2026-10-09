import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import crypto from 'node:crypto'
import { mkdtemp, cp, writeFile, rm, readdir, realpath } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { createEmailSender } from '../server/email.mjs'

let directory, php, smtp, url, failNextMail = false, failAuth = false
const secret = crypto.randomBytes(32).toString('hex')
const messages = [], sockets = new Set()
const quiet = { error() {} }
async function freePort() {
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
function body(values = {}) {
  return JSON.stringify({ to: 'recipient@example.test', kind: 'verification', code: '123456', timestamp: Math.floor(Date.now() / 1000), requestId: crypto.randomUUID(), ...values })
}
async function request(raw = body(), options = {}) {
  const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex')
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ItemsTracker-Signature': signature, ...options.headers }, body: raw })
  return { status: response.status, body: await response.json() }
}
test.before(async () => {
  smtp = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket))
    socket.write('220 localhost relay test SMTP\r\n')
    let buffer = '', data = null, recipient = '', authChallenge = false
    socket.on('data', chunk => {
      buffer += chunk.toString()
      let position
      while ((position = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, position); buffer = buffer.slice(position + 2)
        if (authChallenge) { authChallenge = false; socket.write('235 authenticated\r\n') }
        else if (data !== null) {
          if (line !== '.') { data.push(line); continue }
          if (failNextMail) { failNextMail = false; socket.write('550 message rejected\r\n') }
          else { messages.push({ recipient, body: data.join('\n') }); socket.write('250 accepted\r\n') }
          data = null
        } else if (/^EHLO|^HELO/.test(line)) socket.write('250-localhost\r\n250 AUTH PLAIN\r\n')
        else if (/^AUTH/.test(line)) {
          if (failAuth) socket.write('535 authentication failed\r\n')
          else if (line === 'AUTH PLAIN') { authChallenge = true; socket.write('334 \r\n') }
          else socket.write('235 authenticated\r\n')
        }
        else if (/^RCPT TO:/.test(line)) { recipient = line; socket.write('250 ok\r\n') }
        else if (/^DATA/.test(line)) { data = []; socket.write('354 send message\r\n') }
        else if (/^QUIT/.test(line)) socket.end('221 bye\r\n')
        else socket.write('250 ok\r\n')
      }
    })
  })
  await new Promise(resolve => smtp.listen(0, '127.0.0.1', resolve))
  directory = await mkdtemp(path.join(os.tmpdir(), 'itemstracker-lws-relay-'))
  await cp('lws-email', directory, { recursive: true })
  await writeFile(path.join(directory, 'relay-config.local.php'), `<?php
if (!defined('ITEMS_MAIL_RELAY_CONFIG_LOAD')) { http_response_code(404); exit; }
return ['secret'=>'${secret}','smtpHost'=>'127.0.0.1','smtpPort'=>${smtp.address().port},'smtpSecure'=>'','smtpUser'=>'test-only','smtpPass'=>'test-only','fromEmail'=>'hello@example.test','fromName'=>'ItemsTracker'];
`)
  const port = await freePort(); url = `http://127.0.0.1:${port}/send.php`
  let output = ''
  php = spawn(process.env.PHP_BIN || 'php', ['-S', `127.0.0.1:${port}`, '-t', directory], { stdio: ['ignore', 'pipe', 'pipe'] })
  php.stdout.on('data', data => { output += data }); php.stderr.on('data', data => { output += data })
  for (let i = 0; i < 100; i++) {
    if (php.exitCode !== null) throw new Error(output)
    try { if ((await fetch(url)).status === 405) return } catch { await delay(50) }
  }
  throw new Error('PHP relay did not start')
})
test.after(async () => {
  if (php?.exitCode === null) { php.kill('SIGTERM'); await new Promise(resolve => php.once('exit', resolve)) }
  for (const socket of sockets) socket.destroy()
  if (smtp?.listening) await new Promise(resolve => smtp.close(resolve))
  if (directory) {
    const prefix = 'itemstracker-relay-' + crypto.createHash('sha256').update(await realpath(directory) + secret).digest('hex').slice(0, 24)
    // PHP's sys_get_temp_dir is not always Node's os.tmpdir on macOS.
    for (const location of new Set([os.tmpdir(), '/tmp'])) {
      for (const name of await readdir(location)) if (name === prefix) await rm(path.join(location, name), { recursive: true, force: true })
    }
    await rm(directory, { recursive: true, force: true })
  }
})

test('unsigned or tampered requests, stale timestamps and arbitrary mail content are rejected', async () => {
  const before = messages.length
  assert.equal((await request(body(), { headers: { 'X-ItemsTracker-Signature': '0'.repeat(64) } })).status, 401)
  assert.equal((await request(body({ timestamp: Math.floor(Date.now() / 1000) - 180 }))).status, 400)
  assert.equal((await request(body({ kind: 'marketing' }))).status, 400)
  assert.equal((await request(body({ html: '<p>custom message</p>' }))).status, 400)
  assert.equal((await request(body({ code: '12345678' }))).status, 400)
  assert.equal((await request(body({ to: 'a@example.test\r\nBcc: b@example.test' }))).status, 400)
  assert.equal(messages.length, before)
  const config = await fetch(url.replace('send.php', 'relay-config.local.php'))
  assert.equal(config.status, 404)
  assert.equal(await config.text(), '')
})

test('backend calls PHP relay; PHP sends via local SMTP with the fixed template', async () => {
  const send = createEmailSender({ env: { NODE_ENV: 'test', EMAIL_PROVIDER: 'lws', MAIL_RELAY_URL: url, MAIL_RELAY_SECRET: secret }, logger: quiet,
    smtpFactory: () => { throw new Error('Render must never connect to SMTP') } })
  const result = await send({ to: 'pipeline@example.test', kind: 'verification', code: '654321' })
  assert.equal(result.ok, true)
  assert.match(messages.at(-1).recipient, /pipeline@example.test/)
  assert.match(messages.at(-1).body, /654321/)
  assert.match(messages.at(-1).body, /hello@example.test/)
})

test('signed retry sends exactly one email; changing a used request ID is rejected', async () => {
  const raw = body({ to: 'retry@example.test' }), before = messages.length
  const outcomes = await Promise.all([request(raw), request(raw)])
  assert.deepEqual(outcomes.map(result => result.status), [200, 200])
  assert.equal(messages.length, before + 1)
  assert.equal((await request(JSON.stringify({ ...JSON.parse(raw), code: '654321' }))).status, 409)
})

test('password reset uses the same relay with an eight-digit code', async () => {
  const response = await request(body({ to: 'reset@example.test', kind: 'password-reset', code: '12345678' }))
  assert.equal(response.status, 200)
  assert.match(messages.at(-1).body, /12345678/)
})

test('relay limits repeated emails to a recipient', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await request(body({ to: 'limited@example.test' }))).status, 200)
  assert.equal((await request(body({ to: 'limited@example.test' }))).status, 429)
})

test('SMTP failure is safe and can be retried; authentication error is classified', async () => {
  const raw = body({ to: 'failure@example.test' })
  failNextMail = true
  const failure = await request(raw)
  assert.equal(failure.status, 503)
  assert.equal(failure.body.error, 'MAIL_RELAY_SMTP_FAILED')
  assert.equal((await request(raw)).status, 200)
  failAuth = true
  const auth = await request(body({ to: 'auth@example.test' }))
  failAuth = false
  assert.equal(auth.status, 503)
  assert.equal(auth.body.error, 'MAIL_RELAY_SMTP_AUTH_FAILED')
})

test('backend requires HTTPS in production and valid relay configuration', async () => {
  const base = { EMAIL_PROVIDER: 'lws', MAIL_RELAY_URL: url, MAIL_RELAY_SECRET: secret }
  const send = env => createEmailSender({ env, logger: quiet })
  await assert.rejects(send(base)({ to: 'test@example.test', kind: 'verification', code: '123456' }), error => error.code === 'EMAIL_RELAY_URL_INVALID')
  await assert.rejects(send({ ...base, MAIL_RELAY_SECRET: '' })({}), error => error.code === 'EMAIL_RELAY_CONFIG_MISSING')
  await assert.rejects(send({ ...base, NODE_ENV: 'test' })({ to: 'test@example.test', kind: 'other', code: '123456' }), error => error.code === 'EMAIL_RELAY_MESSAGE_INVALID')
})
