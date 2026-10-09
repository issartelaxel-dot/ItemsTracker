import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

export function prepareMailRelay(destination) {
  const source = resolve(process.cwd(), 'lws-email')
  const target = resolve(destination, 'email-relay')
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(source)) {
    // Configuration is installed once by the owner, never overwritten by a regular deployment.
    if (entry.endsWith('.local.php')) continue
    cpSync(resolve(source, entry), resolve(target, entry), { recursive: true })
  }
  if (!existsSync(resolve(target, 'send.php'))) throw new Error('Missing LWS relay entrypoint')
}
