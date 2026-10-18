import crypto from 'node:crypto'
import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'
import argon2 from 'argon2'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const local = path.join(root, '.local-onboarding')
await mkdir(local, { recursive: true })
await writeFile(path.join(root, 'onboarding-preview.html'), `<!doctype html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>ItemsTracker — Aperçu onboarding local</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n`)
await writeFile(path.join(root, 'admin-app.html'), `<!doctype html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>ItemsTracker — Administration locale</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n`)
const databasePort = 55432
const apiPort = 8787
const webPort = 5173
const smtpPort = 5587
const secret = process.env.LOCAL_ONBOARDING_JWT_SECRET || crypto.createHash('sha256').update(`${root}:local-onboarding`).digest('hex')
const database = new EmbeddedPostgres({ databaseDir: path.join(local, 'postgres'),
  port: databasePort, user: 'postgres', password: 'local-preview-only', persistent: true,
  postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: error => console.error('[PostgreSQL]', error) })
if (!existsSync(path.join(local, 'postgres', 'PG_VERSION'))) await database.initialise()
await database.start()

const smtp = net.createServer(socket => {
  socket.write('220 localhost ItemsTracker preview SMTP\r\n')
  let buffer = '', data = null, recipient = ''
  socket.on('data', chunk => {
    buffer += chunk.toString()
    let position
    while ((position = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, position); buffer = buffer.slice(position + 2)
      if (data !== null) {
        if (line !== '.') { data.push(line); continue }
        const code = data.join('\n').match(/\b\d{6}\b/)?.[0]
        console.log(`[E-MAIL LOCAL] ${recipient}: code de vérification ${code || 'introuvable'}`)
        socket.write('250 accepted\r\n'); data = null
      } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250-localhost\r\n250 AUTH PLAIN\r\n')
      else if (/^AUTH/i.test(line)) socket.write('235 authenticated\r\n')
      else if (/^RCPT TO:/i.test(line)) { recipient = line.slice(8); socket.write('250 ok\r\n') }
      else if (/^DATA/i.test(line)) { data = []; socket.write('354 send message\r\n') }
      else if (/^QUIT/i.test(line)) socket.end('221 bye\r\n')
      else socket.write('250 ok\r\n')
    }
  })
})
await new Promise(resolve => smtp.listen(smtpPort, '127.0.0.1', resolve))

const env = { ...process.env,
  DATABASE_URL: `postgresql://postgres:local-preview-only@127.0.0.1:${databasePort}/postgres`,
  JWT_SECRET: secret, HOST: '127.0.0.1', PORT: String(apiPort), NODE_ENV: 'development',
  CLIENT_ORIGIN: `http://localhost:${webPort}`, CLIENT_ORIGINS: `http://localhost:${webPort},http://127.0.0.1:${webPort}`,
  COOKIE_SECURE: 'false', ACADEMIC_ONBOARDING_ENABLED: 'true',
  EMAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtpPort),
  SMTP_USER: 'local-preview', SMTP_PASS: 'local-preview', MAIL_FROM: 'preview@local.invalid',
  BOOTSTRAP_EMAIL: 'demo@local.test', BOOTSTRAP_PASSWORD: 'Demo-Onboarding-2026!',
  BOOTSTRAP_DISPLAY_NAME: 'Démo', MEDIA_S3_BUCKET: '',
  VITE_API_BASE_URL: '',
}
const children = [
  spawn(process.execPath, ['server/index.mjs'], { cwd: root, env, stdio: 'inherit' }),
  spawn(path.join(root, 'node_modules', '.bin', 'vite'), ['--host', '127.0.0.1', '--port', String(webPort)], { cwd: root, env, stdio: 'inherit' }),
]
console.log(`\nAperçu local : http://127.0.0.1:${webPort}/itemstracker/onboarding-preview.html`)
console.log('Compte de démonstration : demo@local.test / Demo-Onboarding-2026!')
console.log(`Administration locale : http://127.0.0.1:${webPort}/itemstracker/admin-app.html`)
console.log('Pour tester une inscription, le code à 6 chiffres apparaît ici. Aucune donnée ni e-mail ne part en production.\n')
for (let attempt = 0; attempt < 50; attempt++) {
  try { if ((await fetch(`http://127.0.0.1:${apiPort}/api/health`)).ok) break }
  catch { /* Wait for the local server to initialise its tables. */ }
  await new Promise(resolve => setTimeout(resolve, 200))
}
const adminClient = new pg.Client({ connectionString: env.DATABASE_URL })
await adminClient.connect()
try {
  const email = 'hello@setup-hub.com'
  const existing = await adminClient.query('SELECT id FROM users WHERE email=$1', [email])
  if (!existing.rowCount) {
    const hash = await argon2.hash('Admin-Local-2026!', { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 })
    await adminClient.query('INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,$2,$3,$4)',
      [email, 'Admin local', hash, new Date().toISOString()])
  }
  console.log('Compte admin local : hello@setup-hub.com / Admin-Local-2026!')
  const onboardingEmail = 'onboarding@local.test'
  const tester = await adminClient.query('SELECT id FROM users WHERE email=$1', [onboardingEmail])
  if (!tester.rowCount) {
    const hash = await argon2.hash('Onboarding-Local-2026!')
    const created = await adminClient.query('INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,$2,$3,$4) RETURNING id',
      [onboardingEmail, 'Test onboarding', hash, new Date().toISOString()])
    await adminClient.query('INSERT INTO academic_profiles(user_id,legacy_exempt) VALUES($1,FALSE)', [created.rows[0].id])
  }
  console.log('Compte pour essayer l’onboarding : onboarding@local.test / Onboarding-Local-2026!')

} finally { await adminClient.end() }
let closing = false
async function close() {
  if (closing) return
  closing = true
  for (const child of children) child.kill('SIGTERM')
  await new Promise(resolve => smtp.close(resolve))
  await database.stop()
  process.exit(0)
}
process.on('SIGINT', close)
process.on('SIGTERM', close)
for (const child of children) child.on('exit', code => { if (!closing && code) void close() })
