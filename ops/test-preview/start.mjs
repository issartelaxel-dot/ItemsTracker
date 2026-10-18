import { spawn } from 'node:child_process'
const api = spawn(process.execPath, ['server/index.mjs'], { stdio: 'inherit', env: { ...process.env, HOST: '127.0.0.1', PORT: '8787' } })
const gateway = spawn(process.execPath, ['ops/test-preview/gateway.mjs'], { stdio: 'inherit' })
let stopping = false
function stop(code = 0) { if (stopping) return; stopping = true; api.kill('SIGTERM'); gateway.kill('SIGTERM'); setTimeout(() => process.exit(code), 1000).unref() }
for (const child of [api, gateway]) child.on('exit', code => stop(code || 0))
process.on('SIGTERM', () => stop()); process.on('SIGINT', () => stop())
