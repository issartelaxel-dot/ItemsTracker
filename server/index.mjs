import crypto from 'node:crypto'
import process from 'node:process'
import 'dotenv/config'
import argon2 from 'argon2'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import pg from 'pg'
import { z } from 'zod'

const { Pool } = pg

const PORT = Number(process.env.PORT || 8787)
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173'
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
const DATABASE_URL = process.env.DATABASE_URL || ''
const JWT_SECRET = process.env.JWT_SECRET || ''
const NODE_ENV = process.env.NODE_ENV || 'development'
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase()
const COOKIE_SECURE =
  process.env.COOKIE_SECURE === 'true' ? true : process.env.COOKIE_SECURE === 'false' ? false : NODE_ENV === 'production'
const ADMIN_APPROVAL_EMAIL = process.env.ADMIN_APPROVAL_EMAIL || 'issartelaxel@gmail.com'
const AUTH_COOKIE = 'med_auth'
const APPROVAL_CODE_TTL_MS = 15 * 60 * 1000

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be set and at least 32 chars long.')
  process.exit(1)
}

if (!DATABASE_URL) {
  console.error('DATABASE_URL must be set (PostgreSQL connection string).')
  process.exit(1)
}

const useSsl = !/localhost|127\.0\.0\.1/.test(DATABASE_URL)
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
})

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS signup_requests (
      email TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_state (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      tracking_state JSONB NOT NULL,
      theme TEXT NOT NULL DEFAULT 'light',
      focus_mode BOOLEAN NOT NULL DEFAULT FALSE,
      youtube_mode TEXT NOT NULL DEFAULT 'embed',
      profile JSONB,
      updated_at TEXT NOT NULL
    );

    ALTER TABLE user_state
      ADD COLUMN IF NOT EXISTS youtube_mode TEXT NOT NULL DEFAULT 'embed';
  `)
}

const app = express()
const allowedOrigins = new Set(
  CLIENT_ORIGINS.length > 0 ? CLIENT_ORIGINS : [CLIENT_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'],
)

app.set('trust proxy', 1)
app.use(helmet())
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true)
        return
      }
      callback(new Error('Origin not allowed by CORS'))
    },
    credentials: true,
  }),
)
app.use(express.json({ limit: '5mb' }))
app.use(cookieParser())

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
})

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
})

let transporter = null
function getTransporter() {
  if (transporter) {
    return transporter
  }

  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) {
    throw new Error('Missing SMTP_HOST/SMTP_USER/SMTP_PASS in environment variables')
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
  return transporter
}

function normalizeEmail(email) {
  return email.trim().toLowerCase()
}

function hashApprovalCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex')
}

function generateApprovalCode() {
  return String(crypto.randomInt(0, 100_000_000)).padStart(8, '0')
}

function validatePasswordStrength(password) {
  if (password.length < 12) {
    return 'Le mot de passe doit contenir au moins 12 caractères.'
  }
  if (!/[0-9]/.test(password)) {
    return 'Le mot de passe doit contenir au moins un chiffre.'
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Le mot de passe doit contenir au moins un caractère spécial.'
  }
  return null
}

async function ensureBootstrapUser() {
  const emailRaw = process.env.BOOTSTRAP_EMAIL || ''
  const password = process.env.BOOTSTRAP_PASSWORD || ''
  const displayNameRaw = process.env.BOOTSTRAP_DISPLAY_NAME || 'Admin'

  if (!emailRaw || !password) {
    return
  }

  const email = normalizeEmail(emailRaw)
  const passwordError = validatePasswordStrength(password)
  if (passwordError) {
    console.error(`BOOTSTRAP_PASSWORD invalide: ${passwordError}`)
    return
  }

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email])
  if (existing.rows.length > 0) {
    return
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  })

  await pool.query('INSERT INTO users(email, display_name, password_hash, created_at) VALUES($1, $2, $3, $4)', [
    email,
    String(displayNameRaw).trim() || 'Admin',
    passwordHash,
    new Date().toISOString(),
  ])

  console.log(`Bootstrap user created: ${email}`)
}

function signAuthToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

function setAuthCookie(res, token) {
  const sameSite = COOKIE_SAMESITE === 'none' ? 'none' : COOKIE_SAMESITE === 'strict' ? 'strict' : 'lax'
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

function clearAuthCookie(res) {
  const sameSite = COOKIE_SAMESITE === 'none' ? 'none' : COOKIE_SAMESITE === 'strict' ? 'strict' : 'lax'
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite,
    path: '/',
  })
}

function authFromRequest(req) {
  const authHeader = req.headers.authorization || ''
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  const token = bearerToken || req.cookies?.[AUTH_COOKIE]
  if (!token) {
    return null
  }

  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

const requestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(256),
  firstName: z.string().trim().max(120).optional().default(''),
  lastName: z.string().trim().max(120).optional().default(''),
})

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{8}$/),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(256),
})

const passwordResetRequestSchema = z.object({
  email: z.string().email(),
})

const passwordResetConfirmSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{8}$/),
  newPassword: z.string().min(12).max(256),
})

const stateUpdateSchema = z.object({
  trackingState: z.unknown(),
  theme: z.enum(['light', 'dark']),
  focusMode: z.boolean(),
  youtubeDisplayMode: z.enum(['embed', 'external']).optional().default('embed'),
  profile: z.unknown().optional(),
})

async function sendApprovalEmail({ requesterEmail, displayName, code }) {
  const tx = getTransporter()
  const from = process.env.SMTP_FROM || process.env.SMTP_USER

  await tx.sendMail({
    from,
    to: ADMIN_APPROVAL_EMAIL,
    subject: 'Nouvelle demande de création de compte',
    text: [
      'Nouvelle demande de compte:',
      `Email: ${requesterEmail}`,
      `Nom: ${displayName || '(non renseigné)'}`,
      '',
      `Code temporaire (8 chiffres): ${code}`,
      'Validité: 15 minutes',
      '',
      'Transmets ce code à l’utilisateur pour validation du compte.',
    ].join('\n'),
  })
}

async function sendPasswordResetEmail({ userEmail, displayName, code }) {
  const tx = getTransporter()
  const from = process.env.SMTP_FROM || process.env.SMTP_USER

  await tx.sendMail({
    from,
    to: userEmail,
    subject: 'Reinitialisation de mot de passe',
    text: [
      'Demande de reinitialisation de mot de passe',
      `Compte: ${userEmail}`,
      `Nom: ${displayName || '(non renseigne)'}`,
      '',
      `Code temporaire (8 chiffres): ${code}`,
      'Validite: 15 minutes',
      '',
      "Si tu n'es pas a l'origine de cette demande, ignore cet email.",
    ].join('\n'),
  })
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/auth/me', async (req, res) => {
  const auth = authFromRequest(req)
  if (!auth) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const uid = Number(auth.uid)
  if (!Number.isFinite(uid)) {
    clearAuthCookie(res)
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const userResult = await pool.query(
    'SELECT id, email, display_name AS "displayName", created_at AS "createdAt" FROM users WHERE id = $1',
    [uid],
  )
  const user = userResult.rows[0]

  if (!user) {
    clearAuthCookie(res)
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  res.json({ user })
})

app.get('/api/state', async (req, res) => {
  const auth = authFromRequest(req)
  if (!auth) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const uid = Number(auth.uid)
  if (!Number.isFinite(uid)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const result = await pool.query(
    `
      SELECT
        tracking_state AS "trackingState",
        theme,
        focus_mode AS "focusMode",
        youtube_mode AS "youtubeDisplayMode",
        profile,
        updated_at AS "updatedAt"
      FROM user_state
      WHERE user_id = $1
    `,
    [uid],
  )

  res.json({ state: result.rows[0] ?? null })
})

app.put('/api/state', async (req, res) => {
  const auth = authFromRequest(req)
  if (!auth) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const uid = Number(auth.uid)
  if (!Number.isFinite(uid)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const parsed = stateUpdateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Etat invalide.' })
    return
  }

  if (!parsed.data.trackingState || typeof parsed.data.trackingState !== 'object') {
    res.status(400).json({ error: 'Etat invalide.' })
    return
  }

  const now = new Date().toISOString()

  await pool.query(
    `
      INSERT INTO user_state(user_id, tracking_state, theme, focus_mode, youtube_mode, profile, updated_at)
      VALUES($1, $2::jsonb, $3, $4, $5, $6::jsonb, $7)
      ON CONFLICT(user_id) DO UPDATE SET
        tracking_state = EXCLUDED.tracking_state,
        theme = EXCLUDED.theme,
        focus_mode = EXCLUDED.focus_mode,
        youtube_mode = EXCLUDED.youtube_mode,
        profile = EXCLUDED.profile,
        updated_at = EXCLUDED.updated_at
    `,
    [
      uid,
      JSON.stringify(parsed.data.trackingState),
      parsed.data.theme,
      parsed.data.focusMode,
      parsed.data.youtubeDisplayMode,
      JSON.stringify(parsed.data.profile ?? null),
      now,
    ],
  )

  res.json({ ok: true, updatedAt: now })
})

app.use((error, _req, res, next) => {
  if (error?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Etat trop volumineux pour la sauvegarde (payload trop grand).' })
    return
  }
  next(error)
})

app.post('/api/auth/register/request', authLimiter, async (req, res) => {
  const parsed = requestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Données invalides.' })
    return
  }

  const email = normalizeEmail(parsed.data.email)
  const passwordError = validatePasswordStrength(parsed.data.password)
  if (passwordError) {
    res.status(400).json({ error: passwordError })
    return
  }

  const displayName = `${parsed.data.firstName} ${parsed.data.lastName}`.trim()
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email])
  if (existing.rows.length > 0) {
    res.status(409).json({ error: 'Un compte existe déjà avec cet email.' })
    return
  }

  const passwordHash = await argon2.hash(parsed.data.password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  })

  const code = generateApprovalCode()
  const codeHash = hashApprovalCode(code)
  const now = Date.now()

  await pool.query(
    `
      INSERT INTO signup_requests(email, display_name, password_hash, code_hash, expires_at, attempts, created_at)
      VALUES($1, $2, $3, $4, $5, 0, $6)
      ON CONFLICT(email) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        password_hash = EXCLUDED.password_hash,
        code_hash = EXCLUDED.code_hash,
        expires_at = EXCLUDED.expires_at,
        attempts = 0,
        created_at = EXCLUDED.created_at
    `,
    [email, displayName, passwordHash, codeHash, now + APPROVAL_CODE_TTL_MS, new Date(now).toISOString()],
  )

  try {
    await sendApprovalEmail({ requesterEmail: email, displayName, code })
  } catch (error) {
    console.error('Failed to send approval email:', error)
    res.status(500).json({
      error:
        'Impossible d\'envoyer l\'email de validation (SMTP non configuré ou indisponible). Vérifie les variables SMTP.',
    })
    return
  }

  res.json({
    ok: true,
    message:
      'Demande envoyée. Un code temporaire de 8 chiffres a été transmis à l’administrateur pour validation.',
  })
})

app.post('/api/auth/register/verify', verifyLimiter, async (req, res) => {
  const parsed = verifySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Code invalide.' })
    return
  }

  const email = normalizeEmail(parsed.data.email)
  const requestResult = await pool.query(
    `SELECT email, display_name AS "displayName", password_hash AS "passwordHash", code_hash AS "codeHash", expires_at AS "expiresAt", attempts
     FROM signup_requests WHERE email = $1`,
    [email],
  )
  const requestRow = requestResult.rows[0]

  if (!requestRow) {
    res.status(404).json({ error: 'Aucune demande en attente pour cet email.' })
    return
  }

  if (Date.now() > Number(requestRow.expiresAt)) {
    await pool.query('DELETE FROM signup_requests WHERE email = $1', [email])
    res.status(400).json({ error: 'Le code a expiré. Recommence la demande.' })
    return
  }

  const providedHash = hashApprovalCode(parsed.data.code)
  const ok = crypto.timingSafeEqual(Buffer.from(providedHash, 'hex'), Buffer.from(requestRow.codeHash, 'hex'))

  if (!ok) {
    const attempts = Number(requestRow.attempts || 0) + 1
    if (attempts >= 5) {
      await pool.query('DELETE FROM signup_requests WHERE email = $1', [email])
      res.status(429).json({ error: 'Trop de tentatives. Recommence la demande.' })
      return
    }

    await pool.query('UPDATE signup_requests SET attempts = $1 WHERE email = $2', [attempts, email])
    res.status(400).json({ error: 'Code incorrect.' })
    return
  }

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email])
  if (existing.rows.length > 0) {
    await pool.query('DELETE FROM signup_requests WHERE email = $1', [email])
    res.status(409).json({ error: 'Un compte existe déjà avec cet email.' })
    return
  }

  const insertResult = await pool.query(
    'INSERT INTO users(email, display_name, password_hash, created_at) VALUES($1, $2, $3, $4) RETURNING id',
    [email, requestRow.displayName, requestRow.passwordHash, new Date().toISOString()],
  )

  await pool.query('DELETE FROM signup_requests WHERE email = $1', [email])

  const userId = Number(insertResult.rows[0]?.id)
  const token = signAuthToken({ uid: userId, email })
  setAuthCookie(res, token)

  res.json({
    ok: true,
    token,
    user: {
      id: userId,
      email,
      displayName: requestRow.displayName,
    },
  })
})

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Données invalides.' })
    return
  }

  const email = normalizeEmail(parsed.data.email)
  const userResult = await pool.query(
    'SELECT id, email, display_name AS "displayName", password_hash AS "passwordHash" FROM users WHERE email = $1',
    [email],
  )
  const user = userResult.rows[0]

  if (!user) {
    res.status(401).json({ error: 'Email ou mot de passe invalide.' })
    return
  }

  const validPassword = await argon2.verify(user.passwordHash, parsed.data.password)
  if (!validPassword) {
    res.status(401).json({ error: 'Email ou mot de passe invalide.' })
    return
  }

  const token = signAuthToken({ uid: Number(user.id), email: user.email })
  setAuthCookie(res, token)

  res.json({
    ok: true,
    token,
    user: {
      id: Number(user.id),
      email: user.email,
      displayName: user.displayName,
    },
  })
})

app.post('/api/auth/password/request', authLimiter, async (req, res) => {
  const parsed = passwordResetRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Email invalide.' })
    return
  }

  const email = normalizeEmail(parsed.data.email)
  const userResult = await pool.query('SELECT email, display_name AS "displayName" FROM users WHERE email = $1', [email])
  const user = userResult.rows[0]

  if (user) {
    const code = generateApprovalCode()
    const codeHash = hashApprovalCode(code)
    const now = Date.now()

    await pool.query(
      `
        INSERT INTO password_resets(email, code_hash, expires_at, attempts, created_at)
        VALUES($1, $2, $3, 0, $4)
        ON CONFLICT(email) DO UPDATE SET
          code_hash = EXCLUDED.code_hash,
          expires_at = EXCLUDED.expires_at,
          attempts = 0,
          created_at = EXCLUDED.created_at
      `,
      [email, codeHash, now + APPROVAL_CODE_TTL_MS, new Date(now).toISOString()],
    )

    try {
      await sendPasswordResetEmail({ userEmail: email, displayName: user.displayName, code })
    } catch (error) {
      console.error('Failed to send password reset email:', error)
      res.status(500).json({
        error:
          "Impossible d'envoyer l'email de reinitialisation (SMTP non configure ou indisponible). Verifie les variables SMTP.",
      })
      return
    }
  }

  res.json({
    ok: true,
    message: 'Si un compte existe avec cet email, un code de reinitialisation a ete envoye.',
  })
})

app.post('/api/auth/password/confirm', verifyLimiter, async (req, res) => {
  const parsed = passwordResetConfirmSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Donnees invalides.' })
    return
  }

  const passwordError = validatePasswordStrength(parsed.data.newPassword)
  if (passwordError) {
    res.status(400).json({ error: passwordError })
    return
  }

  const email = normalizeEmail(parsed.data.email)
  const userResult = await pool.query('SELECT id, email, display_name AS "displayName" FROM users WHERE email = $1', [email])
  const user = userResult.rows[0]
  const requestResult = await pool.query(
    'SELECT code_hash AS "codeHash", expires_at AS "expiresAt", attempts FROM password_resets WHERE email = $1',
    [email],
  )
  const requestRow = requestResult.rows[0]

  if (!user || !requestRow) {
    res.status(400).json({ error: 'Code invalide ou expire.' })
    return
  }

  if (Date.now() > Number(requestRow.expiresAt)) {
    await pool.query('DELETE FROM password_resets WHERE email = $1', [email])
    res.status(400).json({ error: 'Le code a expire. Redemande un nouveau code.' })
    return
  }

  const providedHash = hashApprovalCode(parsed.data.code)
  const ok = crypto.timingSafeEqual(Buffer.from(providedHash, 'hex'), Buffer.from(requestRow.codeHash, 'hex'))

  if (!ok) {
    const attempts = Number(requestRow.attempts || 0) + 1
    if (attempts >= 5) {
      await pool.query('DELETE FROM password_resets WHERE email = $1', [email])
      res.status(429).json({ error: 'Trop de tentatives. Redemande un nouveau code.' })
      return
    }
    await pool.query('UPDATE password_resets SET attempts = $1 WHERE email = $2', [attempts, email])
    res.status(400).json({ error: 'Code incorrect.' })
    return
  }

  const passwordHash = await argon2.hash(parsed.data.newPassword, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  })

  await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [passwordHash, email])
  await pool.query('DELETE FROM password_resets WHERE email = $1', [email])

  const token = signAuthToken({ uid: Number(user.id), email: user.email })
  setAuthCookie(res, token)

  res.json({
    ok: true,
    token,
    user: {
      id: Number(user.id),
      email: user.email,
      displayName: user.displayName,
    },
  })
})

app.post('/api/auth/logout', (_req, res) => {
  clearAuthCookie(res)
  res.json({ ok: true })
})

async function startServer() {
  await initDb()
  await ensureBootstrapUser()
  app.listen(PORT, () => {
    console.log(`Auth server listening on http://localhost:${PORT}`)
  })
}

startServer().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
