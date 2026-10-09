import nodemailer from 'nodemailer'
import crypto from 'node:crypto'

class EmailDeliveryError extends Error {
  constructor(provider, code, status) {
    super('Email delivery failed')
    this.name = 'EmailDeliveryError'
    this.provider = provider
    this.code = code
    if (status) this.status = status
  }
}

export function createEmailSender({ env = process.env, fetchImpl = globalThis.fetch, smtpFactory = nodemailer.createTransport, logger = console } = {}) {
  let transporter
  const providers = ['smtp', 'resend', 'brevo', 'lws']
  const provider = (env.EMAIL_PROVIDER || (env.MAIL_RELAY_URL ? 'lws' : env.RESEND_API_KEY ? 'resend' : env.BREVO_API_KEY ? 'brevo' : 'smtp')).trim().toLowerCase()
  function fail(code, status) { throw new EmailDeliveryError(providers.includes(provider) ? provider : 'unknown', code, status) }
  return async message => {
    try {
      if (!providers.includes(provider)) fail('EMAIL_PROVIDER_INVALID')
      if (provider === 'lws') {
        if (!env.MAIL_RELAY_URL || !/^[a-f0-9]{64}$/.test(env.MAIL_RELAY_SECRET || '')) fail('EMAIL_RELAY_CONFIG_MISSING')
        let relayUrl
        try { relayUrl = new URL(env.MAIL_RELAY_URL) } catch { fail('EMAIL_RELAY_URL_INVALID') }
        const localTest = env.NODE_ENV === 'test' && ['localhost', '127.0.0.1', '[::1]'].includes(relayUrl.hostname)
        if ((relayUrl.protocol !== 'https:' && !(localTest && relayUrl.protocol === 'http:')) || relayUrl.username || relayUrl.password || relayUrl.hash) fail('EMAIL_RELAY_URL_INVALID')
        const pattern = message.kind === 'verification' ? /^\d{6}$/ : message.kind === 'password-reset' ? /^\d{8}$/ : null
        if (!pattern || typeof message.code !== 'string' || !pattern.test(message.code)) fail('EMAIL_RELAY_MESSAGE_INVALID')
        const body = JSON.stringify({ to: message.to, kind: message.kind, code: message.code, timestamp: Math.floor(Date.now() / 1000), requestId: crypto.randomUUID() })
        const signature = crypto.createHmac('sha256', env.MAIL_RELAY_SECRET).update(body).digest('hex')
        let response
        try {
          response = await fetchImpl(relayUrl.href, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', 'X-ItemsTracker-Signature': signature }, body, signal: AbortSignal.timeout(20_000) })
        } catch (error) { fail(['TimeoutError', 'AbortError'].includes(error.name) ? 'EMAIL_RELAY_TIMEOUT' : 'EMAIL_RELAY_UNREACHABLE') }
        const result = await response.json().catch(() => null)
        if (!response.ok) {
          const allowed = ['MAIL_RELAY_NOT_CONFIGURED', 'MAIL_RELAY_AUTH_FAILED', 'MAIL_RELAY_SMTP_AUTH_FAILED', 'MAIL_RELAY_SMTP_TIMEOUT', 'MAIL_RELAY_SMTP_FAILED', 'MAIL_RELAY_RATE_LIMITED', 'MAIL_RELAY_INVALID_PAYLOAD']
          fail(allowed.includes(result?.error) ? result.error : 'EMAIL_RELAY_REJECTED', response.status)
        }
        if (result?.ok !== true || typeof result.messageId !== 'string' || !result.messageId) fail('EMAIL_RELAY_RESPONSE_INVALID')
        return result
      }
      const from = provider === 'smtp' ? env.MAIL_FROM || env.SMTP_FROM || env.SMTP_USER : env.MAIL_FROM
      if (!from) fail('EMAIL_FROM_MISSING')
      if (provider === 'smtp') {
        if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) fail('SMTP_CONFIG_MISSING')
        transporter ||= smtpFactory({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure: Number(env.SMTP_PORT || 587) === 465,
          auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 })
        try { return await transporter.sendMail({ ...message, from }) }
        catch (error) {
          const codes = { EAUTH: 'SMTP_AUTH_FAILED', ETIMEDOUT: 'SMTP_TIMEOUT', ESOCKET: 'SMTP_CONNECTION_FAILED', ECONNECTION: 'SMTP_CONNECTION_FAILED', EENVELOPE: 'SMTP_RECIPIENT_REJECTED', EMESSAGE: 'SMTP_MESSAGE_REJECTED' }
          fail(codes[error.code] || 'SMTP_SEND_FAILED', Number(error.responseCode) || undefined)
        }
      }
      const key = provider === 'resend' ? env.RESEND_API_KEY : env.BREVO_API_KEY
      if (!key) fail('EMAIL_API_KEY_MISSING')
      let url, headers, payload
      if (provider === 'resend') {
        url = 'https://api.resend.com/emails'
        headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
        payload = { from, to: [message.to], subject: message.subject, text: message.text, html: message.html }
      } else {
        const match = from.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/)
        const sender = match ? { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() } : { email: from.trim() }
        if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(sender.email)) fail('EMAIL_FROM_INVALID')
        url = 'https://api.brevo.com/v3/smtp/email'
        headers = { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' }
        payload = { sender, to: [{ email: message.to }], subject: message.subject, textContent: message.text, htmlContent: message.html }
      }
      let response
      try {
        response = await fetchImpl(url, { method: 'POST', redirect: 'error', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000) })
      } catch (error) { fail(['TimeoutError', 'AbortError'].includes(error.name) ? 'EMAIL_API_TIMEOUT' : 'EMAIL_API_UNREACHABLE') }
      if (!response.ok) fail('EMAIL_API_REJECTED', response.status)
      const result = await response.json().catch(() => null)
      if (!result || typeof (provider === 'resend' ? result.id : result.messageId) !== 'string' || !(provider === 'resend' ? result.id : result.messageId)) {
        fail('EMAIL_API_RESPONSE_INVALID')
      }
      return result
    } catch (error) {
      const safeError = error instanceof EmailDeliveryError ? error : new EmailDeliveryError('unknown', 'EMAIL_SEND_FAILED')
      // Never log the original error, SMTP response, API response or message payload.
      logger.error('Email delivery failed', { provider: safeError.provider, code: safeError.code, ...(safeError.status ? { status: safeError.status } : {}) })
      throw safeError
    }
  }
}
