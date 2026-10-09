import crypto from 'node:crypto'
import argon2 from 'argon2'
import { z } from 'zod'

const TTL = 15 * 60 * 1000
const COOLDOWN = 60 * 1000
const emailSchema = z.string().trim().email().transform(value => value.toLowerCase())
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/)
const requestSchema = z.object({
  email: emailSchema, password: z.string().min(12).max(256),
  firstName: z.string().trim().max(120).default(''), lastName: z.string().trim().max(120).default(''),
})
const resendSchema = z.object({ email: emailSchema, verificationToken: tokenSchema })
const verifySchema = resendSchema.extend({ code: z.string().regex(/^\d{6}$/) })

export function mountRegistration(app, { pool, secret, sendEmail, authLimiter, verifyLimiter, validatePassword, signToken, setCookie }) {
  app.get('/api/auth/register/config', (_req, res) => {
    res.json({ method: 'email', codeLength: 6 })
  })
  const digest = (purpose, email, value) => crypto.createHmac('sha256', secret).update(`${purpose}:${email}:${value}`).digest('hex')
  const matches = (a, b) => typeof b === 'string' && /^[a-f0-9]{64}$/.test(b) && crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  const generateCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  async function transaction(email, handler) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      // Serialize creation, retries and consumption even when no pending row exists yet.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [email])
      const result = await handler(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }
  const pending = async (db, email) => (await db.query('SELECT * FROM signup_requests WHERE email=$1 FOR UPDATE', [email])).rows[0]
  function cooldown(row) {
    return row ? Math.max(0, Math.ceil((Date.parse(row.created_at) + COOLDOWN - Date.now()) / 1000)) : 0
  }
  function respond(res, result) {
    if (result.retryAfter) res.set('Retry-After', String(result.retryAfter))
    res.status(result.status || 200).json(result.body)
  }
  async function deliver(email, code) {
    try { await sendEmail({ email, code }) }
    catch {
      // No code, password, email address or SMTP credentials in logs/responses.
      const error = new Error("L’e-mail n’a pas pu être envoyé. Réessaie dans un instant.")
      error.registrationDelivery = true
      throw error
    }
  }
  const route = handler => async (req, res, next) => {
    try { await handler(req, res) }
    catch (error) {
      if (error.registrationDelivery) res.status(503).json({ error: error.message })
      else next(error)
    }
  }

  app.post('/api/auth/register/request', authLimiter, route(async (req, res) => {
    const parsed = requestSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Vérifie ton adresse e-mail et les informations saisies.' })
    const { email, password, firstName, lastName } = parsed.data
    const passwordError = validatePassword(password)
    if (passwordError) return res.status(400).json({ error: passwordError })
    const result = await transaction(email, async db => {
      if ((await db.query('SELECT id FROM users WHERE email=$1', [email])).rowCount) {
        return { status: 409, body: { error: 'Un compte existe déjà avec cet e-mail. Connecte-toi.' } }
      }
      const row = await pending(db, email)
      const retryAfter = cooldown(row)
      if (retryAfter) return { status: 429, retryAfter, body: { error: `Patiente ${retryAfter} secondes avant de demander un nouveau code.` } }
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 })
      const code = generateCode(), verificationToken = crypto.randomBytes(32).toString('hex'), now = Date.now()
      await db.query(`INSERT INTO signup_requests(email,display_name,password_hash,code_hash,expires_at,attempts,created_at,verification_token_hash)
        VALUES($1,$2,$3,$4,$5,0,$6,$7) ON CONFLICT(email) DO UPDATE SET
        display_name=EXCLUDED.display_name,password_hash=EXCLUDED.password_hash,code_hash=EXCLUDED.code_hash,
        expires_at=EXCLUDED.expires_at,attempts=0,created_at=EXCLUDED.created_at,verification_token_hash=EXCLUDED.verification_token_hash`,
      [email, `${firstName} ${lastName}`.trim(), passwordHash, digest('code', email, code), now + TTL, new Date(now).toISOString(), digest('token', email, verificationToken)])
      // SMTP failure rolls back: an earlier working code remains valid.
      await deliver(email, code)
      return { body: { ok: true, verificationToken, expiresIn: TTL / 1000, resendAfter: COOLDOWN / 1000, message: 'Un code à 6 chiffres a été envoyé à ton adresse e-mail.' } }
    })
    respond(res, result)
  }))

  app.post('/api/auth/register/resend', authLimiter, route(async (req, res) => {
    const parsed = resendSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Recommence ton inscription pour recevoir un code.' })
    const { email, verificationToken } = parsed.data
    const result = await transaction(email, async db => {
      const row = await pending(db, email)
      if (!row || !matches(digest('token', email, verificationToken), row.verification_token_hash)) {
        return { status: 400, body: { error: 'Cette inscription n’est plus active. Recommence ton inscription.' } }
      }
      const retryAfter = cooldown(row)
      if (retryAfter) return { status: 429, retryAfter, body: { error: `Patiente ${retryAfter} secondes avant de renvoyer le code.` } }
      let code = generateCode()
      while (digest('code', email, code) === row.code_hash) code = generateCode()
      const now = Date.now()
      await db.query('UPDATE signup_requests SET code_hash=$1,expires_at=$2,created_at=$3 WHERE email=$4',
        [digest('code', email, code), now + TTL, new Date(now).toISOString(), email])
      await deliver(email, code)
      return { body: { ok: true, expiresIn: TTL / 1000, resendAfter: COOLDOWN / 1000, message: 'Un nouveau code a été envoyé. Utilise le dernier e-mail reçu.' } }
    })
    respond(res, result)
  }))

  app.post('/api/auth/register/verify', verifyLimiter, route(async (req, res) => {
    const parsed = verifySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Saisis le code à 6 chiffres reçu par e-mail.' })
    const { email, code, verificationToken } = parsed.data
    const result = await transaction(email, async db => {
      const row = await pending(db, email)
      if (!row || !matches(digest('token', email, verificationToken), row.verification_token_hash)) {
        return { status: 400, body: { error: 'Cette inscription n’est plus active. Recommence ton inscription.' } }
      }
      if (Date.now() >= Number(row.expires_at)) {
        return { status: 400, body: { error: 'Le code a expiré. Demande un nouveau code.' } }
      }
      if (!matches(digest('code', email, code), row.code_hash)) {
        const attempts = row.attempts + 1
        if (attempts >= 5) {
          await db.query('DELETE FROM signup_requests WHERE email=$1', [email])
          return { status: 429, body: { error: 'Trop de tentatives. Recommence ton inscription.' } }
        }
        await db.query('UPDATE signup_requests SET attempts=$1 WHERE email=$2', [attempts, email])
        return { status: 400, body: { error: 'Code incorrect. Vérifie le dernier e-mail reçu.' } }
      }
      const inserted = await db.query('INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,$2,$3,$4) RETURNING id',
        [email, row.display_name, row.password_hash, new Date().toISOString()])
      await db.query('DELETE FROM signup_requests WHERE email=$1', [email])
      return { body: { ok: true, user: { id: Number(inserted.rows[0].id), email, displayName: row.display_name } } }
    })
    if (result.body.ok) {
      const token = signToken({ uid: result.body.user.id, email })
      setCookie(res, token)
      result.body.token = token
    }
    respond(res, result)
  }))
}
