import { spawn } from 'node:child_process'
export function pgEnvironment(connectionString) {
  const url = new URL(connectionString)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('URL PostgreSQL invalide.')
  return { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: url.searchParams.get('sslmode') || (/^(127\.0\.0\.1|localhost)$/.test(url.hostname) ? 'disable' : 'verify-full') }
}
export function databaseIdentity(connectionString) {
  const url = new URL(connectionString)
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`
}
export async function run(binary, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', data => { stdout += data; if (stdout.length > 20_000_000) child.kill() })
    child.stderr.on('data', data => { stderr += data; if (stderr.length > 2_000_000) child.kill() })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve(stdout) : reject(new Error(`${binary} a échoué (${code}) : ${stderr.slice(-2000)}`)))
  })
}
