import crypto from 'node:crypto'
import process from 'node:process'
import 'dotenv/config'
import argon2 from 'argon2'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import pg from 'pg'
import { z } from 'zod'
import { createStateStore } from './state-store.mjs'
import { createMediaStore } from './media-store.mjs'
import { persistSchema, StateError } from './state-model.mjs'
import { mountRegistration } from './registration.mjs'

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
const DB_SSL_REJECT_UNAUTHORIZED = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase()
const COOKIE_SECURE =
  process.env.COOKIE_SECURE === 'true' ? true : process.env.COOKIE_SECURE === 'false' ? false : NODE_ENV === 'production'
const APP_VERSION = (process.env.APP_VERSION || '0.1.0').trim()
const MIN_CLIENT_VERSION = (process.env.MIN_CLIENT_VERSION || '0.1.0').trim()
const AUTH_COOKIE = 'med_auth'
const APPROVAL_CODE_TTL_MS = 15 * 60 * 1000
const AUTH_SESSION_TTL_MS = 45 * 60 * 1000
const JSON_BODY_LIMIT = (process.env.JSON_BODY_LIMIT || '80mb').trim() || '80mb'
const STATE_WRITE_LIMIT_PER_MIN = Number(process.env.STATE_WRITE_LIMIT_PER_MIN || 120)
const STATE_MAX_IMAGE_UPSERT_PER_REQUEST = Number(process.env.STATE_MAX_IMAGE_UPSERT_PER_REQUEST || 80)
const STATE_MAX_IMAGE_DATA_LENGTH = Number(process.env.STATE_MAX_IMAGE_DATA_LENGTH || 1_800_000)
const N8N_MCQ_WEBHOOK_URL = (
  process.env.N8N_MCQ_WEBHOOK_URL || 'https://n8n.setup-hub.com/webhook/generate-mcq'
).trim()
const MCQ_GENERATION_TIMEOUT_MS = Number(process.env.MCQ_GENERATION_TIMEOUT_MS || 30_000)
const MCQ_GENERATION_LIMIT_PER_MIN = Number(process.env.MCQ_GENERATION_LIMIT_PER_MIN || 30)

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
  ssl: useSsl ? { rejectUnauthorized: DB_SSL_REJECT_UNAUTHORIZED } : false,
})

const stateStore = createStateStore(pool, { mediaStore: createMediaStore() })

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

    ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS verification_token_hash TEXT;

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
      updated_at TEXT NOT NULL,
      version BIGINT NOT NULL DEFAULT 0,
      last_snapshot_at TEXT
    );

    CREATE TABLE IF NOT EXISTS user_state_idempotency (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      request_id TEXT NOT NULL,
      response JSONB NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(user_id, endpoint, request_id)
    );

    CREATE TABLE IF NOT EXISTS user_state_snapshots (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      version BIGINT NOT NULL,
      state JSONB NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_quiz_images (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_number INTEGER NOT NULL,
      card_id TEXT NOT NULL,
      image_slot TEXT NOT NULL DEFAULT 'back',
      image_data TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, item_number, card_id, image_slot)
    );

    ALTER TABLE user_state
      ADD COLUMN IF NOT EXISTS youtube_mode TEXT NOT NULL DEFAULT 'embed';

    ALTER TABLE user_state
      ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;

    ALTER TABLE user_state
      ADD COLUMN IF NOT EXISTS last_snapshot_at TEXT;

    CREATE INDEX IF NOT EXISTS idx_user_state_snapshots_user_created
      ON user_state_snapshots(user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_user_state_idempotency_created
      ON user_state_idempotency(created_at);
  `)

  await pool.query(`
    ALTER TABLE user_quiz_images
      ADD COLUMN IF NOT EXISTS image_slot TEXT NOT NULL DEFAULT 'back'
  `)

  await pool.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='user_quiz_images'::regclass
      AND contype='p' AND array_length(conkey,1)=3) THEN
      ALTER TABLE user_quiz_images DROP CONSTRAINT user_quiz_images_pkey;
      ALTER TABLE user_quiz_images ADD PRIMARY KEY(user_id,item_number,card_id,image_slot);
    END IF;
  END $$`)
  await stateStore.init()
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
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Version'],
    exposedHeaders: ['x-app-version', 'x-min-client-version'],
  }),
)
app.use(compression({ threshold: 1024 }))
app.use(express.json({ limit: JSON_BODY_LIMIT }))
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

const stateWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Math.max(20, STATE_WRITE_LIMIT_PER_MIN),
  standardHeaders: true,
  legacyHeaders: false,
})

const mcqGenerationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Math.max(5, MCQ_GENERATION_LIMIT_PER_MIN),
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
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '45m' })
}

function setAuthCookie(res, token) {
  const sameSite = COOKIE_SAMESITE === 'none' ? 'none' : COOKIE_SAMESITE === 'strict' ? 'strict' : 'lax'
  const secure = sameSite === 'none' ? true : COOKIE_SECURE
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: AUTH_SESSION_TTL_MS,
    path: '/',
  })
}

function clearAuthCookie(res) {
  const sameSite = COOKIE_SAMESITE === 'none' ? 'none' : COOKIE_SAMESITE === 'strict' ? 'strict' : 'lax'
  const secure = sameSite === 'none' ? true : COOKIE_SECURE
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
  })
}

function authFromRequest(req) {
  const authHeader = req.get('authorization') || req.get('Authorization') || ''
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i)
  const cookieToken = String(req.cookies?.[AUTH_COOKIE] || '').trim()
  const bearerToken = String(bearerMatch?.[1] || '').trim()
  if (!cookieToken && !bearerToken) {
    return null
  }

  try {
    if (cookieToken) {
      return jwt.verify(cookieToken, JWT_SECRET)
    }
  } catch {
    // Try bearer fallback when cookie is invalid/expired.
  }

  try {
    if (bearerToken) {
      return jwt.verify(bearerToken, JWT_SECRET)
    }
  } catch {
    return null
  }
  return null
}

function refreshAuthCookie(res, auth) {
  const uid = Number(auth?.uid)
  const email = typeof auth?.email === 'string' ? auth.email : ''
  if (!Number.isFinite(uid) || !email) {
    return null
  }
  const token = signAuthToken({ uid, email })
  setAuthCookie(res, token)
  return token
}

function parseVersion(rawValue) {
  const value = String(rawValue || '').trim()
  if (!value) {
    return null
  }
  const normalized = value.replace(/^v/i, '')
  const segments = normalized.split('.')
  const numbers = []
  for (const segment of segments) {
    const match = segment.match(/^(\d+)/)
    if (!match) {
      break
    }
    numbers.push(Number(match[1]))
  }
  return numbers.length > 0 ? numbers : null
}

function compareVersions(a, b) {
  const maxLen = Math.max(a.length, b.length)
  for (let index = 0; index < maxLen; index += 1) {
    const left = a[index] ?? 0
    const right = b[index] ?? 0
    if (left > right) {
      return 1
    }
    if (left < right) {
      return -1
    }
  }
  return 0
}

const parsedMinClientVersion = parseVersion(MIN_CLIENT_VERSION)

function enforceClientVersion(req, res, next) {
  res.setHeader('x-app-version', APP_VERSION)
  if (parsedMinClientVersion) {
    res.setHeader('x-min-client-version', MIN_CLIENT_VERSION)
  }

  if (!parsedMinClientVersion) {
    next()
    return
  }

  const clientVersionRaw = req.get('x-client-version') || ''
  const parsedClientVersion = parseVersion(clientVersionRaw)

  if (!parsedClientVersion || compareVersions(parsedClientVersion, parsedMinClientVersion) < 0) {
    res.status(426).json({
      error: 'Client obsolète. Recharge la page pour appliquer la dernière mise à jour.',
      code: 'CLIENT_STALE',
      minClientVersion: MIN_CLIENT_VERSION,
      serverVersion: APP_VERSION,
    })
    return
  }

  next()
}

const runtimeStateMetrics = {
  fullSaveCount: 0,
  patchSaveCount: 0,
  imageSyncCount: 0,
  fullSaveBytes: 0,
  patchBytes: 0,
  imageBytes: 0,
}

function recordStateMetric(kind, bytes) {
  const safeBytes = Number.isFinite(bytes) ? Math.max(0, Math.floor(bytes)) : 0
  if (kind === 'full') {
    runtimeStateMetrics.fullSaveCount += 1
    runtimeStateMetrics.fullSaveBytes += safeBytes
    return
  }
  if (kind === 'patch') {
    runtimeStateMetrics.patchSaveCount += 1
    runtimeStateMetrics.patchBytes += safeBytes
    return
  }
  if (kind === 'images') {
    runtimeStateMetrics.imageSyncCount += 1
    runtimeStateMetrics.imageBytes += safeBytes
  }
}

function normalizeQuizImageSlot(rawValue) {
  return rawValue === 'front' ? 'front' : 'back'
}

function applyQuizImagesToTrackingState(trackingState, imageRows, options = {}) {
  const metadataOnly = Boolean(options.metadataOnly)
  const clonedTrackingState = JSON.parse(JSON.stringify(trackingState ?? { items: {} }))
  const items = clonedTrackingState && typeof clonedTrackingState === 'object' ? clonedTrackingState.items : null
  if (!items || typeof items !== 'object') {
    return clonedTrackingState
  }

  for (const itemTracking of Object.values(items)) {
    const cards = itemTracking?.quiz?.cards
    if (!Array.isArray(cards)) {
      continue
    }
    for (const card of cards) {
      if (!card || typeof card !== 'object') {
        continue
      }
      card.frontImageDataUrl = ''
      card.hasFrontImageDataUrl = false
      card.backImageDataUrl = ''
      card.hasBackImageDataUrl = false
      card.imageDataUrl = ''
      card.hasImageDataUrl = false
    }
  }

  if (!Array.isArray(imageRows) || imageRows.length === 0) {
    return clonedTrackingState
  }

  for (const row of imageRows) {
    const itemNumber = Number(row.item_number)
    const cardId = typeof row.card_id === 'string' ? row.card_id : ''
    const imageSlot = normalizeQuizImageSlot(row.image_slot)
    const imageDataUrl = typeof row.image_data === 'string' ? row.image_data : ''
    if (!Number.isFinite(itemNumber) || !cardId) {
      continue
    }
    const itemTracking = items[itemNumber]
    const cards = itemTracking?.quiz?.cards
    if (!Array.isArray(cards)) {
      continue
    }
    const card = cards.find((entry) => entry && entry.id === cardId)
    if (!card || typeof card !== 'object') {
      continue
    }
    if (imageSlot === 'front') {
      card.frontImageDataUrl = metadataOnly ? '' : imageDataUrl
      card.hasFrontImageDataUrl = true
      continue
    }
    card.backImageDataUrl = metadataOnly ? '' : imageDataUrl
    card.hasBackImageDataUrl = true
    card.imageDataUrl = metadataOnly ? '' : imageDataUrl
    card.hasImageDataUrl = true
  }

  return clonedTrackingState
}

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

const saveProtocol = {
  baseVersion: z.number().int().nonnegative(),
  requestId: z.string().trim().min(6).max(120),
}
const stateUpdateSchema = persistSchema.extend(saveProtocol)
const statePatchSchema = z.object({ patch: z.record(z.string(), z.unknown()), ...saveProtocol })

const stateImageSyncSchema = z.object({
  upsert: z
    .array(
      z.object({
        itemNumber: z.number().int().min(1).max(9999),
        cardId: z.string().trim().min(1).max(120),
        imageSlot: z.enum(['front', 'back']).optional().default('back'),
        imageDataUrl: z.string().trim().min(1).max(STATE_MAX_IMAGE_DATA_LENGTH),
      }),
    )
    .max(STATE_MAX_IMAGE_UPSERT_PER_REQUEST)
    .optional()
    .default([]),
  removed: z
    .array(
      z.object({
        itemNumber: z.number().int().min(1).max(9999),
        cardId: z.string().trim().min(1).max(120),
        imageSlot: z.enum(['front', 'back']).optional().default('back'),
      }),
    )
    .max(STATE_MAX_IMAGE_UPSERT_PER_REQUEST * 2)
    .optional()
    .default([]),
  ...saveProtocol,
})

const mcqGenerateSchema = z.object({
  question: z.string().trim().min(1).max(2_000),
  correctAnswer: z.string().trim().min(1).max(2_000),
  itemNumber: z.number().int().positive().max(9999),
  cardId: z.string().trim().min(1).max(120).optional(),
  college: z.string().trim().max(160).optional().default(''),
})

function normalizeMcqWebhookPayload(payload) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const rawDistractors = Array.isArray(source.distractors) ? source.distractors : []
  const seen = new Set()
  const distractors = []

  for (const entry of rawDistractors) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const text = typeof entry.text === 'string' ? entry.text.trim() : ''
    if (!text || text.length > 1_000) {
      continue
    }
    const key = text.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    distractors.push({
      id: `d${distractors.length + 1}`,
      text,
      whyWrong: typeof entry.whyWrong === 'string' ? entry.whyWrong.trim().slice(0, 1_000) : '',
    })
    if (distractors.length === 3) {
      break
    }
  }

  return {
    success: Boolean(source.success) && distractors.length === 3,
    distractors,
    explanation: typeof source.explanation === 'string' ? source.explanation.trim().slice(0, 1_500) : '',
  }
}

async function sendVerificationEmail({ email, code }) {
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Votre code de vérification ItemsTracker',
    text: `Bienvenue sur ItemsTracker !\n\nVotre code de vérification : ${code}\n\nCe code est valable 15 minutes. Ne le partagez pas.\nSi vous n’avez pas demandé cette inscription, ignorez cet e-mail.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;color:#14233d"><strong style="color:#1767ff">ItemsTracker</strong><h1 style="font-size:24px">Confirmez votre adresse e-mail.</h1><p>Pour créer votre espace de révision, saisissez ce code :</p><p style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1767ff;background:#edf4ff;padding:24px;text-align:center">${code}</p><p>Valable 15 minutes. Ne partagez pas ce code.</p><p style="font-size:12px;color:#667085">Si vous n’avez pas demandé cette inscription, ignorez cet e-mail.</p></div>`,
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

app.get('/api/auth/me', enforceClientVersion, async (req, res) => {
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

  const refreshedToken = refreshAuthCookie(res, auth)
  res.json({ user, ...(refreshedToken ? { token: refreshedToken } : {}) })
})

// Le renouvellement de session ne réveille pas PostgreSQL.
app.get('/api/session', enforceClientVersion, (req, res) => {
  const auth = authFromRequest(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })
  const token = refreshAuthCookie(res, auth)
  res.json({ ok: true, ...(token ? { token } : {}) })
})

app.get('/api/state', enforceClientVersion, async (req, res) => {
  const auth = authFromRequest(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })
  const metadataOnly = req.query.imageMode === 'metadata'
  const { state, version, images } = await stateStore.read(Number(auth.uid), { metadataOnly })
  if (state) state.trackingState = applyQuizImagesToTrackingState(state.trackingState, images, { metadataOnly })
  const token = refreshAuthCookie(res, auth)
  res.json({ state, version, imageVersions: Object.fromEntries((images || []).map(row => [`${row.item_number}:${row.card_id}:${row.image_slot}`, row.content_hash || row.updated_at || 'legacy'])), ...(token ? { token } : {}) })
})

app.get('/api/state/images/:itemNumber/:cardId', enforceClientVersion, async (req, res) => {
  const auth = authFromRequest(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })
  const itemNumber = Number(req.params.itemNumber)
  const cardId = req.params.cardId?.trim()
  if (!Number.isInteger(itemNumber) || itemNumber < 1 || itemNumber > 9999 || !cardId || cardId.length > 120) {
    return res.status(400).json({ error: 'Image invalide.' })
  }
  const images = await stateStore.cardImages(Number(auth.uid), itemNumber, cardId)
  const token = refreshAuthCookie(res, auth)
  res.json({ ...images, ...(token ? { token } : {}) })
})

app.get('/api/storage-usage', enforceClientVersion, async (req, res) => {
  const auth = authFromRequest(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })
  res.json(await stateStore.storageUsage(Number(auth.uid)))
})

app.post('/api/quiz/generate-mcq', enforceClientVersion, mcqGenerationLimiter, async (req, res) => {
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

  if (!N8N_MCQ_WEBHOOK_URL) {
    res.status(503).json({ error: 'Generation QCM non configuree.', code: 'MCQ_WEBHOOK_NOT_CONFIGURED' })
    return
  }

  const parsed = mcqGenerateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Donnees QCM invalides.', code: 'INVALID_MCQ_INPUT' })
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(5_000, MCQ_GENERATION_TIMEOUT_MS))

  try {
    const response = await fetch(N8N_MCQ_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
      signal: controller.signal,
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      res.status(502).json({ error: 'Generation QCM indisponible.', code: 'MCQ_WEBHOOK_ERROR' })
      return
    }

    const normalized = normalizeMcqWebhookPayload(payload)
    if (!normalized.success) {
      res.status(502).json({
        error: 'Generation QCM incomplete.',
        code: 'INVALID_MCQ_RESPONSE',
        distractors: normalized.distractors,
        explanation: normalized.explanation,
      })
      return
    }

    const refreshedToken = refreshAuthCookie(res, auth)
    res.json({ ...normalized, generatedAt: new Date().toISOString(), ...(refreshedToken ? { token: refreshedToken } : {}) })
  } catch (error) {
    const isTimeout = error?.name === 'AbortError'
    res.status(504).json({
      error: isTimeout ? 'Generation QCM trop lente.' : 'Generation QCM impossible.',
      code: isTimeout ? 'MCQ_TIMEOUT' : 'MCQ_GENERATION_FAILED',
    })
  } finally {
    clearTimeout(timeout)
  }
})

for (const [method, path, kind, schema] of [
  ['put', '/api/state', 'state-full', stateUpdateSchema],
  ['patch', '/api/state', 'state-patch', statePatchSchema],
  ['post', '/api/state/images', 'state-images', stateImageSyncSchema],
]) {
  app[method](path, enforceClientVersion, stateWriteLimiter, async (req, res) => {
    const auth = authFromRequest(req)
    if (!auth) return res.status(401).json({ error: 'Unauthorized' })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Sauvegarde invalide : version et identifiant requis.', code: 'SAVE_PROTOCOL_REQUIRED' })
    const response = await stateStore.write(Number(auth.uid), kind, parsed.data)
    recordStateMetric(kind === 'state-full' ? 'full' : kind === 'state-patch' ? 'patch' : 'images', Buffer.byteLength(JSON.stringify(req.body)))
    const token = refreshAuthCookie(res, auth)
    res.json({ ...response, ...(token ? { token } : {}) })
  })
}

app.get('/api/state/metrics', enforceClientVersion, async (req, res) => {
  const auth = authFromRequest(req)
  if (!auth) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  res.json({ ok: true, metrics: runtimeStateMetrics })
})

app.use((error, _req, res, next) => {
  if (error?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Etat trop volumineux pour la sauvegarde (payload trop grand).' })
    return
  }
  next(error)
})

mountRegistration(app, {
  pool, secret: JWT_SECRET, sendEmail: sendVerificationEmail,
  authLimiter, verifyLimiter, validatePassword: validatePasswordStrength,
  signToken: signAuthToken, setCookie: setAuthCookie,
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

  let validPassword = false
  try {
    validPassword = await argon2.verify(user.passwordHash, parsed.data.password)
  } catch (error) {
    console.error(`Password verification failed for user ${user.id}:`, error)
  }
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

app.use((error, _req, res, next) => {
  if (res.headersSent) {
    next(error)
    return
  }

  if (error instanceof StateError) {
    res.status(error.status).json({ error: error.message, code: error.code,
      ...(error.version !== undefined ? { version: error.version } : {}) })
    return
  }
  const status = Number(error?.status || error?.statusCode)
  const safeStatus = Number.isInteger(status) && status >= 400 && status < 500 ? status : 500
  if (safeStatus >= 500) {
    console.error('Unhandled API error:', error)
  }
  res.status(safeStatus).json({
    error: safeStatus >= 500 ? 'Erreur serveur temporaire. Réessaie dans un instant.' : 'Requête invalide.',
  })
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
