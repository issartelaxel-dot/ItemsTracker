import crypto from 'node:crypto'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { StateError } from './state-model.mjs'

export function parseImage(dataUrl, maxBytes = 1_350_000) {
  const match = typeof dataUrl === 'string' && dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]*={0,2})$/)
  if (!match || !match[2] || match[2].length % 4 !== 0) {
    throw new StateError(400, 'INVALID_IMAGE', 'Image invalide : PNG, JPEG, WebP ou GIF requis.')
  }
  const body = Buffer.from(match[2], 'base64')
  if (body.toString('base64') !== match[2]) throw new StateError(400, 'INVALID_IMAGE', 'Encodage de l’image invalide.')
  if (body.length > maxBytes) throw new StateError(413, 'IMAGE_TOO_LARGE', 'Image trop volumineuse.')
  const hash = crypto.createHash('sha256').update(body).digest('hex')
  return { body, mime: match[1], hash }
}

export function createMediaStore(env = process.env) {
  const bucket = env.MEDIA_S3_BUCKET?.trim()
  if (!bucket) return null // Aucun nouvel abonnement imposé ; données historiques lisibles.
  if (!env.MEDIA_S3_ACCESS_KEY_ID || !env.MEDIA_S3_SECRET_ACCESS_KEY) {
    throw new Error('Le stockage privé nécessite MEDIA_S3_ACCESS_KEY_ID et MEDIA_S3_SECRET_ACCESS_KEY.')
  }
  const client = new S3Client({
    region: env.MEDIA_S3_REGION || 'eu-central-1',
    ...(env.MEDIA_S3_ENDPOINT ? { endpoint: env.MEDIA_S3_ENDPOINT } : {}),
    forcePathStyle: env.MEDIA_S3_FORCE_PATH_STYLE !== 'false',
    credentials: { accessKeyId: env.MEDIA_S3_ACCESS_KEY_ID, secretAccessKey: env.MEDIA_S3_SECRET_ACCESS_KEY },
  })
  const prefix = (env.MEDIA_S3_PREFIX || 'itemstracker/media').replace(/^\/+|\/+$/g, '')
  return {
    client, bucket, prefix,
    async put(userId, image) {
      // Clé immuable : remplacer une image ne détruit pas celle d'un ancien backup.
      const key = `${prefix}/${userId}/${image.hash}`
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: image.body, ContentType: image.mime }))
      return key
    },
    async read(row) {
      if (!row.object_key) return row.image_data || ''
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: row.object_key }))
      const body = await result.Body.transformToByteArray()
      return `data:${row.mime_type};base64,${Buffer.from(body).toString('base64')}`
    },
  }
}

export async function readMedia(row, mediaStore) {
  if (!row.object_key) return row.image_data || ''
  if (!mediaStore) throw new StateError(503, 'MEDIA_UNAVAILABLE', 'Stockage des images indisponible. Réessaye plus tard.')
  return mediaStore.read(row)
}
