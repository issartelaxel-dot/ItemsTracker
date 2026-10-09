import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmailSender } from '../server/email.mjs'

const message = { to: 'recipient@example.test', subject: 'Verification', text: 'Code: 123456', html: '<p>123456</p>' }
const sender = 'ItemsTracker <noreply@example.test>'
const quiet = { error() {} }

test('Resend sends through HTTPS using a verified sender, never SMTP', async () => {
  let sent
  const send = createEmailSender({ env: { RESEND_API_KEY: 'test-key', MAIL_FROM: sender }, logger: quiet,
    smtpFactory: () => { throw new Error('Must not use SMTP') },
    fetchImpl: async (url, options) => { sent = { url, options }; return Response.json({ id: 'mail-id' }) } })
  assert.deepEqual(await send(message), { id: 'mail-id' })
  assert.equal(sent.url, 'https://api.resend.com/emails')
  assert.equal(sent.options.headers.Authorization, 'Bearer test-key')
  assert.equal(sent.options.redirect, 'error')
  assert.ok(sent.options.signal instanceof AbortSignal)
  assert.deepEqual(JSON.parse(sent.options.body), { ...message, from: sender, to: [message.to] })
})

test('Brevo maps recipient, sender and content to its HTTPS API', async () => {
  let sent
  const send = createEmailSender({ env: { BREVO_API_KEY: 'test-key', MAIL_FROM: sender }, logger: quiet,
    fetchImpl: async (url, options) => { sent = { url, options }; return Response.json({ messageId: '<mail-id>' }, { status: 201 }) } })
  assert.deepEqual(await send(message), { messageId: '<mail-id>' })
  assert.equal(sent.url, 'https://api.brevo.com/v3/smtp/email')
  assert.equal(sent.options.headers['api-key'], 'test-key')
  assert.deepEqual(JSON.parse(sent.options.body), { sender: { name: 'ItemsTracker', email: 'noreply@example.test' },
    to: [{ email: message.to }], subject: message.subject, textContent: message.text, htmlContent: message.html })
})

test('explicit SMTP preserves existing configuration and reuses its transport', async () => {
  let transportCount = 0, options, sent
  const send = createEmailSender({ env: { EMAIL_PROVIDER: 'smtp', RESEND_API_KEY: 'unused', SMTP_HOST: 'localhost', SMTP_PORT: '465', SMTP_USER: 'user', SMTP_PASS: 'password', SMTP_FROM: sender }, logger: quiet,
    fetchImpl: () => { throw new Error('Must not use HTTP') }, smtpFactory: config => {
      transportCount++; options = config; return { sendMail: async data => { sent = data; return { accepted: [data.to] } } }
    } })
  await send(message); await send(message)
  assert.equal(transportCount, 1)
  assert.equal(options.secure, true)
  assert.equal(options.socketTimeout, 15_000)
  assert.deepEqual(sent, { ...message, from: sender })
})

test('missing configuration fails without network calls or logging secret payloads', async () => {
  const cases = [
    [{ EMAIL_PROVIDER: 'resend', MAIL_FROM: sender }, 'EMAIL_API_KEY_MISSING'],
    [{ RESEND_API_KEY: 'secret' }, 'EMAIL_FROM_MISSING'],
    [{ EMAIL_PROVIDER: 'smtp', SMTP_FROM: sender }, 'SMTP_CONFIG_MISSING'],
    [{ EMAIL_PROVIDER: 'typo', MAIL_FROM: sender }, 'EMAIL_PROVIDER_INVALID'],
    [{ BREVO_API_KEY: 'secret', MAIL_FROM: 'invalid' }, 'EMAIL_FROM_INVALID'],
  ]
  for (const [env, code] of cases) {
    let log
    const send = createEmailSender({ env, logger: { error: (...args) => { log = JSON.stringify(args) } },
      fetchImpl: () => { throw new Error('No network calls allowed') } })
    await assert.rejects(send(message), error => error.code === code)
    for (const privateValue of ['secret', '123456', message.to, sender]) assert.ok(!log.includes(privateValue))
  }
})

test('provider rejections, malformed success and network failures do not silently fall back to SMTP', async () => {
  for (const status of [400, 401, 403, 429, 500]) {
    let log
    const send = createEmailSender({ env: { RESEND_API_KEY: 'private-key', MAIL_FROM: sender },
      smtpFactory: () => { throw new Error('No fallback allowed') }, logger: { error: (...args) => { log = JSON.stringify(args) } },
      fetchImpl: async () => Response.json({ message: `private-key ${message.to} ${message.text}` }, { status }) })
    await assert.rejects(send(message), error => error.code === 'EMAIL_API_REJECTED' && error.status === status)
    for (const privateValue of ['private-key', '123456', message.to]) assert.ok(!log.includes(privateValue))
  }
  const send = fetchImpl => createEmailSender({ env: { RESEND_API_KEY: 'test-key', MAIL_FROM: sender }, logger: quiet, fetchImpl })
  await assert.rejects(send(async () => Response.json({}))(message), error => error.code === 'EMAIL_API_RESPONSE_INVALID')
  await assert.rejects(send(async () => { throw new DOMException('timeout', 'TimeoutError') })(message), error => error.code === 'EMAIL_API_TIMEOUT')
  await assert.rejects(send(async () => { throw new Error('private network error') })(message), error => error.code === 'EMAIL_API_UNREACHABLE')
})

test('SMTP diagnostics classify authentication and timeout without disclosing server responses', async () => {
  for (const [code, expected] of [['EAUTH', 'SMTP_AUTH_FAILED'], ['ETIMEDOUT', 'SMTP_TIMEOUT']]) {
    let log
    const send = createEmailSender({ env: { EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'localhost', SMTP_USER: 'private-user', SMTP_PASS: 'private-pass', SMTP_FROM: sender },
      logger: { error: (...args) => { log = JSON.stringify(args) } }, smtpFactory: () => ({ sendMail: async () => {
        throw Object.assign(new Error('private-user private-pass 123456'), { code, response: message.to })
      } }) })
    await assert.rejects(send(message), error => error.code === expected)
    for (const privateValue of ['private-user', 'private-pass', '123456', message.to]) assert.ok(!log.includes(privateValue))
  }
})
