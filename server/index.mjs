import crypto from 'node:crypto'
import process from 'node:process'
import 'dotenv/config'
import Database from 'better-sqlite3'
import argon2 from 'argon2'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import { z } from 'zod'

const PORT = Number(process.env.PORT || 8787)
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173'
const JWT_SECRET = process.env.JWT_SECRET || ''
const NODE_ENV = process.env.NODE_ENV || 'development'
const ADMIN_APPROVAL_EMAIL = process.env.ADMIN_APPROVAL_EMAIL || 'issartelaxel@gmail.com'
const AUTH_COOKIE = 'med_auth'
const APPROVAL_CODE_TTL_MS = 15 * 60 * 1000

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be set and at least 32 chars long.')
  process.exit(1)
}

const db = new Database('server/data.db')
db.pragma('journal_mode = WAL')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`)

const app = express()

app.set('trust proxy', 1)
app.use(helmet())
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  }),
)
app.use(express.json({ limit: '200kb' }))
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

function signAuthToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  })
}

function authFromRequest(req) {
  const token = req.cookies?.[AUTH_COOKIE]
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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/auth/me', (req, res) => {
  const auth = authFromRequest(req)
  if (!auth) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const user = db
    .prepare('SELECT id, email, display_name AS displayName, created_at AS createdAt FROM users WHERE id = ?')
    .get(auth.uid)

  if (!user) {
    clearAuthCookie(res)
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  res.json({ user })
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
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existing) {
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

  db.prepare(
    `
      INSERT INTO signup_requests(email, display_name, password_hash, code_hash, expires_at, attempts, created_at)
      VALUES(?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT(email) DO UPDATE SET
        display_name = excluded.display_name,
        password_hash = excluded.password_hash,
        code_hash = excluded.code_hash,
        expires_at = excluded.expires_at,
        attempts = 0,
        created_at = excluded.created_at
    `,
  ).run(email, displayName, passwordHash, codeHash, now + APPROVAL_CODE_TTL_MS, new Date(now).toISOString())

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
  const requestRow = db.prepare('SELECT * FROM signup_requests WHERE email = ?').get(email)
  if (!requestRow) {
    res.status(404).json({ error: 'Aucune demande en attente pour cet email.' })
    return
  }

  if (Date.now() > Number(requestRow.expires_at)) {
    db.prepare('DELETE FROM signup_requests WHERE email = ?').run(email)
    res.status(400).json({ error: 'Le code a expiré. Recommence la demande.' })
    return
  }

  const providedHash = hashApprovalCode(parsed.data.code)
  const ok = crypto.timingSafeEqual(Buffer.from(providedHash, 'hex'), Buffer.from(requestRow.code_hash, 'hex'))

  if (!ok) {
    const attempts = Number(requestRow.attempts || 0) + 1
    if (attempts >= 5) {
      db.prepare('DELETE FROM signup_requests WHERE email = ?').run(email)
      res.status(429).json({ error: 'Trop de tentatives. Recommence la demande.' })
      return
    }

    db.prepare('UPDATE signup_requests SET attempts = ? WHERE email = ?').run(attempts, email)
    res.status(400).json({ error: 'Code incorrect.' })
    return
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existing) {
    db.prepare('DELETE FROM signup_requests WHERE email = ?').run(email)
    res.status(409).json({ error: 'Un compte existe déjà avec cet email.' })
    return
  }

  const result = db
    .prepare('INSERT INTO users(email, display_name, password_hash, created_at) VALUES(?, ?, ?, ?)')
    .run(email, requestRow.display_name, requestRow.password_hash, new Date().toISOString())

  db.prepare('DELETE FROM signup_requests WHERE email = ?').run(email)

  const token = signAuthToken({ uid: result.lastInsertRowid, email })
  setAuthCookie(res, token)

  res.json({
    ok: true,
    user: {
      id: result.lastInsertRowid,
      email,
      displayName: requestRow.display_name,
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
  const user = db
    .prepare('SELECT id, email, display_name AS displayName, password_hash AS passwordHash FROM users WHERE email = ?')
    .get(email)

  if (!user) {
    res.status(401).json({ error: 'Email ou mot de passe invalide.' })
    return
  }

  const validPassword = await argon2.verify(user.passwordHash, parsed.data.password)
  if (!validPassword) {
    res.status(401).json({ error: 'Email ou mot de passe invalide.' })
    return
  }

  const token = signAuthToken({ uid: user.id, email: user.email })
  setAuthCookie(res, token)

  res.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    },
  })
})

app.post('/api/auth/logout', (_req, res) => {
  clearAuthCookie(res)
  res.json({ ok: true })
})

app.listen(PORT, () => {
  console.log(`Auth server listening on http://localhost:${PORT}`)
})
