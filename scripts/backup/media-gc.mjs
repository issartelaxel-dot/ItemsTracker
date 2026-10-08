import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { createMediaStore } from '../../server/media-store.mjs'
export async function collectMediaGarbage(pool, env = process.env, { mediaStore: injectedStore } = {}) {
  if (env.MEDIA_GC_ENABLED !== 'true') return { skipped: true }
  const mediaStore = injectedStore || createMediaStore(env)
  if (!mediaStore) return { skipped: true }
  const days = Number(env.MEDIA_GC_RETENTION_DAYS || 45)
  if (!Number.isInteger(days) || days < 31) throw new Error('MEDIA_GC_RETENTION_DAYS doit être au moins 31 jours (45 conseillés).')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // All app media writes lock their user first. Lock the users during the
    // bounded GC batch so a retired key cannot be reused just before deletion.
    await client.query('SELECT id FROM users ORDER BY id FOR UPDATE')
    const candidates = (await client.query(`SELECT object_key FROM media_gc_candidates g
      WHERE retired_at < NOW() - ($1 * interval '1 day')
      AND NOT EXISTS (SELECT 1 FROM user_quiz_images i WHERE i.object_key=g.object_key)
      AND NOT EXISTS (SELECT 1 FROM user_state_snapshots s,
        LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.state->'media')='array' THEN s.state->'media' ELSE '[]'::jsonb END) m
        WHERE m->>'object_key'=g.object_key) LIMIT 100`, [days])).rows
    for (const row of candidates) {
      if (!row.object_key.startsWith(`${mediaStore.prefix}/`)) throw new Error('Objet hors du préfixe média applicatif.')
      await mediaStore.client.send(new DeleteObjectCommand({ Bucket: mediaStore.bucket, Key: row.object_key }))
      await client.query('DELETE FROM media_gc_candidates WHERE object_key=$1', [row.object_key])
    }
    await client.query('COMMIT')
    return { removed: candidates.length }
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error }
  finally { client.release() }
}
