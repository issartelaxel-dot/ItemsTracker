import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { rmSync } from 'node:fs'

export function archiveDeploy(directory) {
  const archive = resolve(directory, 'Archive.zip')
  rmSync(archive, { force: true })
  const result = spawnSync('zip', ['-q', '-r', archive, '.', '-x', 'Archive.zip'], {
    cwd: directory,
    stdio: 'inherit',
  })
  if (result.error || result.status !== 0) {
    throw new Error(`Could not create Archive.zip. Install the zip command or zip the deployment files manually. ${result.error?.message || ''}`)
  }
  console.log(`Upload-ready archive: ${archive}`)
}
