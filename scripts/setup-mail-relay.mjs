import crypto from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnv } from 'vite'

const root = process.cwd()
const directory = resolve(root, 'installation-mail-lws')
const configPath = resolve(directory, 'relay-config.local.php')
mkdirSync(directory, { recursive: true, mode: 0o700 })
let secret
if (existsSync(configPath)) {
  secret = readFileSync(configPath, 'utf8').match(/'secret'\s*=>\s*'([a-f0-9]{64})'/)?.[1]
  if (!secret) throw new Error('Existing relay configuration has no valid secret. Preserve it and check the secret field.')
} else {
  secret = crypto.randomBytes(32).toString('hex')
  const template = readFileSync(resolve(root, 'lws-email/relay-config.example.php'), 'utf8')
  writeFileSync(configPath, template.replace("'secret' => ''", `'secret' => '${secret}'`), { mode: 0o600 })
}
const base = process.env.VITE_BASE_PATH || loadEnv('production', root, 'VITE_').VITE_BASE_PATH || '/itemstracker/'
const url = process.env.MAIL_RELAY_PUBLIC_URL || `https://setup-hub.com${base.endsWith('/') ? base : `${base}/`}email-relay/send.php`
const parsed = new URL(url)
if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || /\s/.test(url)) throw new Error('Relay URL must use HTTPS.')
writeFileSync(resolve(directory, 'render.env.local'), `EMAIL_PROVIDER=lws\nMAIL_RELAY_URL=${url}\nMAIL_RELAY_SECRET=${secret}\n`, { mode: 0o600 })
console.log('LWS setup files ready in installation-mail-lws/. No secrets printed.')
console.log('Fill smtpPass in relay-config.local.php, upload it to itemstracker/email-relay/ after checking PHP, then copy render.env.local values into Render.')
