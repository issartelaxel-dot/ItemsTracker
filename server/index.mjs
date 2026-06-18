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
const APP_VERSION = (process.env.APP_VERSION || 'dev').trim()
const MIN_CLIENT_VERSION = (process.env.MIN_CLIENT_VERSION || '').trim()
const ADMIN_APPROVAL_EMAIL = process.env.ADMIN_APPROVAL_EMAIL || 'issartelaxel@gmail.com'
const AUTH_COOKIE = 'med_auth'
const APPROVAL_CODE_TTL_MS = 15 * 60 * 1000
const AUTH_SESSION_TTL_MS = 45 * 60 * 1000
const JSON_BODY_LIMIT = (process.env.JSON_BODY_LIMIT || '80mb').trim() || '80mb'
const STATE_SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000
const STATE_WRITE_LIMIT_PER_MIN = Number(process.env.STATE_WRITE_LIMIT_PER_MIN || 120)
const STATE_MAX_IMAGE_UPSERT_PER_REQUEST = Number(process.env.STATE_MAX_IMAGE_UPSERT_PER_REQUEST || 80)
const STATE_MAX_TOTAL_IMAGES_PER_USER = Number(process.env.STATE_MAX_TOTAL_IMAGES_PER_USER || 5000)
const STATE_MAX_IMAGE_DATA_LENGTH = Number(process.env.STATE_MAX_IMAGE_DATA_LENGTH || 1_800_000)

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
      image_data TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, item_number, card_id)
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

function getDefaultPersistState() {
  return {
    trackingState: { items: {} },
    theme: 'light',
    focusMode: false,
    youtubeDisplayMode: 'embed',
    profile: null,
  }
}

function extractQuizImagesFromTrackingState(trackingState) {
  const clonedTrackingState = JSON.parse(JSON.stringify(trackingState ?? { items: {} }))
  const images = []
  const items = clonedTrackingState && typeof clonedTrackingState === 'object' ? clonedTrackingState.items : null
  if (!items || typeof items !== 'object') {
    return { trackingState: { items: {} }, images }
  }

  for (const [itemNumberRaw, itemTracking] of Object.entries(items)) {
    const itemNumber = Number(itemNumberRaw)
    if (!Number.isFinite(itemNumber) || !itemTracking || typeof itemTracking !== 'object') {
      continue
    }
    const cards = itemTracking?.quiz?.cards
    if (!Array.isArray(cards)) {
      continue
    }
    for (const card of cards) {
      if (!card || typeof card !== 'object') {
        continue
      }
      const cardId = typeof card.id === 'string' ? card.id.trim() : ''
      const imageDataUrl = typeof card.imageDataUrl === 'string' ? card.imageDataUrl.trim() : ''
      if (!cardId) {
        continue
      }
      if (imageDataUrl) {
        images.push({ itemNumber, cardId, imageDataUrl })
      }
      card.imageDataUrl = ''
    }
  }

  return { trackingState: clonedTrackingState, images }
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
    card.imageDataUrl = metadataOnly ? '' : imageDataUrl
    card.hasImageDataUrl = true
  }

  return clonedTrackingState
}

function normalizeRequestId(rawValue) {
  const requestId = String(rawValue || '').trim()
  if (!requestId) {
    return ''
  }
  return requestId.slice(0, 120)
}

function createGeneratedRequestId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

async function consumeIdempotentResponse({ userId, endpoint, requestId }) {
  if (!requestId) {
    return null
  }
  const existing = await pool.query(
    `SELECT response FROM user_state_idempotency WHERE user_id = $1 AND endpoint = $2 AND request_id = $3`,
    [userId, endpoint, requestId],
  )
  return (existing.rows[0]?.response ?? null) || null
}

async function storeIdempotentResponse({ userId, endpoint, requestId, response }) {
  if (!requestId) {
    return
  }
  await pool.query(
    `
      INSERT INTO user_state_idempotency(user_id, endpoint, request_id, response, created_at)
      VALUES($1, $2, $3, $4::jsonb, $5)
      ON CONFLICT(user_id, endpoint, request_id) DO NOTHING
    `,
    [userId, endpoint, requestId, JSON.stringify(response), new Date().toISOString()],
  )
}

function applyMergePatch(baseValue, patchValue) {
  if (patchValue === null || patchValue === undefined) {
    return null
  }
  if (Array.isArray(patchValue)) {
    return JSON.parse(JSON.stringify(patchValue))
  }
  if (typeof patchValue !== 'object') {
    return patchValue
  }

  const baseObject = baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue) ? baseValue : {}
  const nextValue = JSON.parse(JSON.stringify(baseObject))
  for (const [key, value] of Object.entries(patchValue)) {
    if (value === null) {
      delete nextValue[key]
      continue
    }
    nextValue[key] = applyMergePatch(nextValue[key], value)
  }
  return nextValue
}

async function loadUserStateRow(userId) {
  const result = await pool.query(
    `
      SELECT
        tracking_state AS "trackingState",
        theme,
        focus_mode AS "focusMode",
        youtube_mode AS "youtubeDisplayMode",
        profile,
        updated_at AS "updatedAt",
        version,
        last_snapshot_at AS "lastSnapshotAt"
      FROM user_state
      WHERE user_id = $1
    `,
    [userId],
  )
  return result.rows[0] ?? null
}

function rowToPersistPayload(row) {
  if (!row) {
    return getDefaultPersistState()
  }
  return {
    trackingState: row.trackingState && typeof row.trackingState === 'object' ? row.trackingState : { items: {} },
    theme: row.theme === 'dark' ? 'dark' : 'light',
    focusMode: Boolean(row.focusMode),
    youtubeDisplayMode: row.youtubeDisplayMode === 'external' ? 'external' : 'embed',
    profile: row.profile ?? null,
  }
}

async function maybeCreateStateSnapshot({ userId, version, payload, lastSnapshotAt }) {
  const lastSnapshotMs = typeof lastSnapshotAt === 'string' ? Date.parse(lastSnapshotAt) : 0
  const nowMs = Date.now()
  const needsSnapshot = !Number.isFinite(lastSnapshotMs) || lastSnapshotMs <= 0 || nowMs - lastSnapshotMs >= STATE_SNAPSHOT_INTERVAL_MS
  if (!needsSnapshot) {
    return null
  }
  const createdAt = new Date(nowMs).toISOString()
  await pool.query(
    `INSERT INTO user_state_snapshots(user_id, version, state, created_at) VALUES($1, $2, $3::jsonb, $4)`,
    [userId, version, JSON.stringify(payload), createdAt],
  )
  return createdAt
}

async function touchUserStateUpdatedAt(userId, updatedAt) {
  await pool.query(
    `
      UPDATE user_state
      SET updated_at = $2
      WHERE user_id = $1
    `,
    [userId, updatedAt],
  )
}

async function upsertQuizImages(userId, upsertRows, removedRows) {
  const safeUpserts = Array.isArray(upsertRows) ? upsertRows : []
  const safeRemoved = Array.isArray(removedRows) ? removedRows : []

  if (safeUpserts.length > STATE_MAX_IMAGE_UPSERT_PER_REQUEST) {
    throw new Error(`Too many images in one request (${safeUpserts.length}).`)
  }

  const normalizedUpserts = []
  for (const row of safeUpserts) {
    const itemNumber = Number(row?.itemNumber)
    const cardId = typeof row?.cardId === 'string' ? row.cardId.trim() : ''
    const imageDataUrl = typeof row?.imageDataUrl === 'string' ? row.imageDataUrl.trim() : ''
    if (!Number.isFinite(itemNumber) || !cardId || !imageDataUrl) {
      continue
    }
    if (imageDataUrl.length > STATE_MAX_IMAGE_DATA_LENGTH) {
      throw new Error(`Image too large for card ${cardId}.`)
    }
    normalizedUpserts.push({ itemNumber, cardId, imageDataUrl })
  }

  const normalizedRemoved = []
  for (const row of safeRemoved) {
    const itemNumber = Number(row?.itemNumber)
    const cardId = typeof row?.cardId === 'string' ? row.cardId.trim() : ''
    if (!Number.isFinite(itemNumber) || !cardId) {
      continue
    }
    normalizedRemoved.push({ itemNumber, cardId })
  }

  const currentCountResult = await pool.query('SELECT COUNT(*)::int AS count FROM user_quiz_images WHERE user_id = $1', [userId])
  const currentCount = Number(currentCountResult.rows[0]?.count || 0)
  const estimatedFinalCount = Math.max(0, currentCount - normalizedRemoved.length + normalizedUpserts.length)
  if (estimatedFinalCount > STATE_MAX_TOTAL_IMAGES_PER_USER) {
    throw new Error(`Image quota exceeded (${STATE_MAX_TOTAL_IMAGES_PER_USER}).`)
  }

  for (const row of normalizedRemoved) {
    await pool.query('DELETE FROM user_quiz_images WHERE user_id = $1 AND item_number = $2 AND card_id = $3', [
      userId,
      row.itemNumber,
      row.cardId,
    ])
  }

  const now = new Date().toISOString()
  for (const row of normalizedUpserts) {
    await pool.query(
      `
        INSERT INTO user_quiz_images(user_id, item_number, card_id, image_data, updated_at)
        VALUES($1, $2, $3, $4, $5)
        ON CONFLICT(user_id, item_number, card_id) DO UPDATE SET
          image_data = EXCLUDED.image_data,
          updated_at = EXCLUDED.updated_at
      `,
      [userId, row.itemNumber, row.cardId, row.imageDataUrl, now],
    )
  }

  return {
    upserted: normalizedUpserts.length,
    removed: normalizedRemoved.length,
    total: estimatedFinalCount,
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
  baseVersion: z.number().int().nonnegative().optional(),
  requestId: z.string().trim().min(6).max(120).optional(),
})

const statePatchSchema = z.object({
  patch: z.unknown(),
  baseVersion: z.number().int().nonnegative().optional(),
  requestId: z.string().trim().min(6).max(120).optional(),
})

const stateImageSyncSchema = z.object({
  upsert: z
    .array(
      z.object({
        itemNumber: z.number().int(),
        cardId: z.string().trim().min(1).max(120),
        imageDataUrl: z.string().trim().min(1).max(STATE_MAX_IMAGE_DATA_LENGTH),
      }),
    )
    .max(STATE_MAX_IMAGE_UPSERT_PER_REQUEST)
    .optional()
    .default([]),
  removed: z
    .array(
      z.object({
        itemNumber: z.number().int(),
        cardId: z.string().trim().min(1).max(120),
      }),
    )
    .max(STATE_MAX_IMAGE_UPSERT_PER_REQUEST * 2)
    .optional()
    .default([]),
  requestId: z.string().trim().min(6).max(120).optional(),
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

app.get('/api/state', enforceClientVersion, async (req, res) => {
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

  const row = await loadUserStateRow(uid)
  if (!row) {
    const refreshedToken = refreshAuthCookie(res, auth)
    res.json({ state: null, version: 0, ...(refreshedToken ? { token: refreshedToken } : {}) })
    return
  }

  const extractedLegacyImages = extractQuizImagesFromTrackingState(row.trackingState)
  if (extractedLegacyImages.images.length > 0) {
    try {
      await upsertQuizImages(uid, extractedLegacyImages.images, [])
      await pool.query('UPDATE user_state SET tracking_state = $2::jsonb WHERE user_id = $1', [
        uid,
        JSON.stringify(extractedLegacyImages.trackingState),
      ])
      row.trackingState = extractedLegacyImages.trackingState
    } catch (error) {
      console.error('Legacy image migration failed:', error)
    }
  }

  const metadataOnly = req.query.imageMode === 'metadata'
  const imageRows = await pool.query(
    metadataOnly
      ? `SELECT item_number, card_id FROM user_quiz_images WHERE user_id = $1`
      : `SELECT item_number, card_id, image_data FROM user_quiz_images WHERE user_id = $1`,
    [uid],
  )
  const hydratedTrackingState = applyQuizImagesToTrackingState(row.trackingState, imageRows.rows, { metadataOnly })

  const state = {
    trackingState: hydratedTrackingState,
    theme: row.theme,
    focusMode: row.focusMode,
    youtubeDisplayMode: row.youtubeDisplayMode,
    profile: row.profile,
    updatedAt: row.updatedAt,
  }
  const refreshedToken = refreshAuthCookie(res, auth)
  res.json({ state, version: Number(row.version || 0), ...(refreshedToken ? { token: refreshedToken } : {}) })
})

app.get('/api/state/images/:itemNumber/:cardId', enforceClientVersion, async (req, res) => {
  const auth = authFromRequest(req)
  if (!auth) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const uid = Number(auth.uid)
  const itemNumber = Number(req.params.itemNumber)
  const cardId = typeof req.params.cardId === 'string' ? req.params.cardId.trim() : ''
  if (!Number.isFinite(uid) || !Number.isFinite(itemNumber) || !cardId || cardId.length > 120) {
    res.status(400).json({ error: 'Image invalide.' })
    return
  }

  const result = await pool.query(
    `SELECT image_data FROM user_quiz_images WHERE user_id = $1 AND item_number = $2 AND card_id = $3`,
    [uid, itemNumber, cardId],
  )
  const imageDataUrl = typeof result.rows[0]?.image_data === 'string' ? result.rows[0].image_data : ''
  const refreshedToken = refreshAuthCookie(res, auth)
  res.json({ imageDataUrl, ...(refreshedToken ? { token: refreshedToken } : {}) })
})

app.put('/api/state', enforceClientVersion, stateWriteLimiter, async (req, res) => {
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

  const requestId = normalizeRequestId(parsed.data.requestId) || createGeneratedRequestId('full')
  const existingIdempotent = await consumeIdempotentResponse({ userId: uid, endpoint: 'state-full', requestId })
  if (existingIdempotent) {
    const refreshedToken = refreshAuthCookie(res, auth)
    res.json({ ...existingIdempotent, ...(refreshedToken ? { token: refreshedToken } : {}) })
    return
  }

  if (!parsed.data.trackingState || typeof parsed.data.trackingState !== 'object') {
    res.status(400).json({ error: 'Etat invalide.' })
    return
  }

  const existingRow = await loadUserStateRow(uid)
  const currentVersion = Number(existingRow?.version || 0)
  const baseVersion = Number.isFinite(parsed.data.baseVersion) ? Number(parsed.data.baseVersion) : null
  if (baseVersion !== null && baseVersion !== currentVersion) {
    res.status(409).json({ error: 'Etat modifié ailleurs.', code: 'STATE_CONFLICT', version: currentVersion })
    return
  }

  const extracted = extractQuizImagesFromTrackingState(parsed.data.trackingState)
  try {
    await upsertQuizImages(uid, extracted.images, [])
  } catch (error) {
    res.status(413).json({ error: error instanceof Error ? error.message : 'Erreur quota images.' })
    return
  }

  const now = new Date().toISOString()
  const nextVersion = currentVersion + 1
  const snapshotPayload = {
    trackingState: extracted.trackingState,
    theme: parsed.data.theme,
    focusMode: parsed.data.focusMode,
    youtubeDisplayMode: parsed.data.youtubeDisplayMode,
    profile: parsed.data.profile ?? null,
  }
  const nextSnapshotAt = await maybeCreateStateSnapshot({
    userId: uid,
    version: nextVersion,
    payload: snapshotPayload,
    lastSnapshotAt: existingRow?.lastSnapshotAt,
  })

  await pool.query(
    `
      INSERT INTO user_state(user_id, tracking_state, theme, focus_mode, youtube_mode, profile, updated_at, version, last_snapshot_at)
      VALUES($1, $2::jsonb, $3, $4, $5, $6::jsonb, $7, $8, $9)
      ON CONFLICT(user_id) DO UPDATE SET
        tracking_state = EXCLUDED.tracking_state,
        theme = EXCLUDED.theme,
        focus_mode = EXCLUDED.focus_mode,
        youtube_mode = EXCLUDED.youtube_mode,
        profile = EXCLUDED.profile,
        updated_at = EXCLUDED.updated_at,
        version = EXCLUDED.version,
        last_snapshot_at = COALESCE(EXCLUDED.last_snapshot_at, user_state.last_snapshot_at)
    `,
    [
      uid,
      JSON.stringify(extracted.trackingState),
      parsed.data.theme,
      parsed.data.focusMode,
      parsed.data.youtubeDisplayMode,
      JSON.stringify(parsed.data.profile ?? null),
      now,
      nextVersion,
      nextSnapshotAt,
    ],
  )

  const bodyBytes = Buffer.byteLength(JSON.stringify(req.body), 'utf8')
  recordStateMetric('full', bodyBytes)

  const responsePayload = { ok: true, updatedAt: now, version: nextVersion }
  await storeIdempotentResponse({ userId: uid, endpoint: 'state-full', requestId, response: responsePayload })

  const refreshedToken = refreshAuthCookie(res, auth)
  res.json({ ...responsePayload, ...(refreshedToken ? { token: refreshedToken } : {}) })
})

app.patch('/api/state', enforceClientVersion, stateWriteLimiter, async (req, res) => {
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

  const parsed = statePatchSchema.safeParse(req.body)
  if (!parsed.success || !parsed.data.patch || typeof parsed.data.patch !== 'object') {
    res.status(400).json({ error: 'Patch invalide.' })
    return
  }

  const requestId = normalizeRequestId(parsed.data.requestId) || createGeneratedRequestId('patch')
  const existingIdempotent = await consumeIdempotentResponse({ userId: uid, endpoint: 'state-patch', requestId })
  if (existingIdempotent) {
    const refreshedToken = refreshAuthCookie(res, auth)
    res.json({ ...existingIdempotent, ...(refreshedToken ? { token: refreshedToken } : {}) })
    return
  }

  const existingRow = await loadUserStateRow(uid)
  const currentVersion = Number(existingRow?.version || 0)
  const baseVersion = Number.isFinite(parsed.data.baseVersion) ? Number(parsed.data.baseVersion) : null
  if (baseVersion !== null && baseVersion !== currentVersion) {
    res.status(409).json({ error: 'Etat modifié ailleurs.', code: 'STATE_CONFLICT', version: currentVersion })
    return
  }

  const currentPayload = rowToPersistPayload(existingRow)
  const mergedPayload = applyMergePatch(currentPayload, parsed.data.patch)
  const validated = stateUpdateSchema.safeParse(mergedPayload)
  if (!validated.success || !validated.data.trackingState || typeof validated.data.trackingState !== 'object') {
    res.status(400).json({ error: 'Patch invalide (état final non valide).' })
    return
  }

  const extracted = extractQuizImagesFromTrackingState(validated.data.trackingState)
  try {
    await upsertQuizImages(uid, extracted.images, [])
  } catch (error) {
    res.status(413).json({ error: error instanceof Error ? error.message : 'Erreur quota images.' })
    return
  }

  const now = new Date().toISOString()
  const nextVersion = currentVersion + 1
  const snapshotPayload = {
    trackingState: extracted.trackingState,
    theme: validated.data.theme,
    focusMode: validated.data.focusMode,
    youtubeDisplayMode: validated.data.youtubeDisplayMode,
    profile: validated.data.profile ?? null,
  }
  const nextSnapshotAt = await maybeCreateStateSnapshot({
    userId: uid,
    version: nextVersion,
    payload: snapshotPayload,
    lastSnapshotAt: existingRow?.lastSnapshotAt,
  })

  await pool.query(
    `
      INSERT INTO user_state(user_id, tracking_state, theme, focus_mode, youtube_mode, profile, updated_at, version, last_snapshot_at)
      VALUES($1, $2::jsonb, $3, $4, $5, $6::jsonb, $7, $8, $9)
      ON CONFLICT(user_id) DO UPDATE SET
        tracking_state = EXCLUDED.tracking_state,
        theme = EXCLUDED.theme,
        focus_mode = EXCLUDED.focus_mode,
        youtube_mode = EXCLUDED.youtube_mode,
        profile = EXCLUDED.profile,
        updated_at = EXCLUDED.updated_at,
        version = EXCLUDED.version,
        last_snapshot_at = COALESCE(EXCLUDED.last_snapshot_at, user_state.last_snapshot_at)
    `,
    [
      uid,
      JSON.stringify(extracted.trackingState),
      validated.data.theme,
      validated.data.focusMode,
      validated.data.youtubeDisplayMode,
      JSON.stringify(validated.data.profile ?? null),
      now,
      nextVersion,
      nextSnapshotAt,
    ],
  )

  const patchBytes = Buffer.byteLength(JSON.stringify(parsed.data.patch), 'utf8')
  recordStateMetric('patch', patchBytes)

  const responsePayload = { ok: true, updatedAt: now, version: nextVersion }
  await storeIdempotentResponse({ userId: uid, endpoint: 'state-patch', requestId, response: responsePayload })

  const refreshedToken = refreshAuthCookie(res, auth)
  res.json({ ...responsePayload, ...(refreshedToken ? { token: refreshedToken } : {}) })
})

app.post('/api/state/images', enforceClientVersion, stateWriteLimiter, async (req, res) => {
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

  const parsed = stateImageSyncSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload images invalide.' })
    return
  }

  const requestId = normalizeRequestId(parsed.data.requestId) || createGeneratedRequestId('images')
  const existingIdempotent = await consumeIdempotentResponse({ userId: uid, endpoint: 'state-images', requestId })
  if (existingIdempotent) {
    const refreshedToken = refreshAuthCookie(res, auth)
    res.json({ ...existingIdempotent, ...(refreshedToken ? { token: refreshedToken } : {}) })
    return
  }

  let syncResult = null
  try {
    syncResult = await upsertQuizImages(uid, parsed.data.upsert, parsed.data.removed)
  } catch (error) {
    res.status(413).json({ error: error instanceof Error ? error.message : 'Erreur synchronisation images.' })
    return
  }

  const updatedAt = new Date().toISOString()
  await touchUserStateUpdatedAt(uid, updatedAt)

  const payloadBytes = Buffer.byteLength(JSON.stringify(req.body), 'utf8')
  recordStateMetric('images', payloadBytes)

  const responsePayload = { ok: true, updatedAt, ...syncResult }
  await storeIdempotentResponse({ userId: uid, endpoint: 'state-images', requestId, response: responsePayload })

  const refreshedToken = refreshAuthCookie(res, auth)
  res.json({ ...responsePayload, ...(refreshedToken ? { token: refreshedToken } : {}) })
})

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
