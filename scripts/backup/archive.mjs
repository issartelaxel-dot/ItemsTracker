import crypto from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { open, appendFile, stat, rm } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
const MAGIC = Buffer.from('ITBACK01')
export function backupKey(value) {
  const key = Buffer.from(value || '', 'base64')
  if (key.length !== 32 || key.toString('base64') !== value) throw new Error('BACKUP_ENCRYPTION_KEY doit contenir 32 octets encodés en base64.')
  return key
}
export async function encryptArchive(source, destination, key) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(MAGIC)
  const handle = await open(destination, 'wx', 0o600)
  try {
    await handle.write(Buffer.concat([MAGIC, iv])); await handle.close()
    await pipeline(createReadStream(source), cipher, createWriteStream(destination, { flags: 'a', mode: 0o600 }))
    await appendFile(destination, cipher.getAuthTag())
  } catch (error) { await handle.close().catch(() => {}); await rm(destination, { force: true }); throw error }
}
export async function decryptArchive(source, destination, key) {
  const size = (await stat(source)).size
  if (size < 36) throw new Error('Archive tronquée.')
  const handle = await open(source, 'r')
  const head = Buffer.alloc(20), tag = Buffer.alloc(16)
  try { await handle.read(head, 0, 20, 0); await handle.read(tag, 0, 16, size - 16) }
  finally { await handle.close() }
  if (!head.subarray(0, 8).equals(MAGIC)) throw new Error('Format de sauvegarde invalide.')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, head.subarray(8))
  decipher.setAAD(MAGIC); decipher.setAuthTag(tag)
  try { await pipeline(createReadStream(source, { start: 20, end: size - 17 }), decipher, createWriteStream(destination, { flags: 'wx', mode: 0o600 })) }
  catch (error) { await rm(destination, { force: true }); throw new Error('Authentification de sauvegarde impossible : clé incorrecte ou fichier corrompu.', { cause: error }) }
}
