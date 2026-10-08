import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
export async function configurePitr({ env = process.env, apply = false, fetchImpl = fetch } = {}) {
  const days = Number(env.NEON_PITR_DAYS || 7)
  if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error('NEON_PITR_DAYS doit être compris entre 1 et 30.')
  const projectId = env.NEON_PROJECT_ID?.trim()
  if (!projectId || !/^[a-z0-9-]{1,60}$/.test(projectId) || !env.NEON_API_KEY) throw new Error('Configurer NEON_PROJECT_ID et NEON_API_KEY pour lire ou appliquer le PITR.')
  const url = `https://console.neon.tech/api/v2/projects/${projectId}`
  const headers = { Authorization: `Bearer ${env.NEON_API_KEY}`, 'Content-Type': 'application/json' }
  async function call(method, body) {
    const response = await fetchImpl(url, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Neon API ${response.status}. Vérifier les droits et la limite de rétention de l’offre ; aucune offre ne sera changée automatiquement.`)
    return (await response.json()).project
  }
  const before = await call('GET')
  const seconds = days * 86400
  const current = Number(before.history_retention_seconds)
  // Preserve an existing longer window; this command only improves protection.
  if (current >= seconds) return { projectId, applied: false, alreadyProtected: true, retentionDays: current / 86400 }
  if (!apply) return { projectId, applied: false, currentDays: current / 86400, requestedDays: days, change: { project: { history_retention_seconds: seconds } } }
  await call('PATCH', { project: { history_retention_seconds: seconds } })
  const after = await call('GET')
  if (Number(after.history_retention_seconds) < seconds) throw new Error('Le PITR demandé n’a pas été confirmé par Neon.')
  return { projectId, applied: true, retentionDays: Number(after.history_retention_seconds) / 86400 }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  configurePitr({ apply: process.argv.includes('--apply') }).then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1 })
}
