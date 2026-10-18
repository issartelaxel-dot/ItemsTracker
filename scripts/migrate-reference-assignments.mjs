import { readFile, mkdir, open } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import pg from 'pg'
import { createStateStore } from '../server/state-store.mjs'
import { buildReferenceAliases, planReferenceTransition } from '../server/reference-transition.mjs'

const [mode, userIdText, file, backupDirectory] = process.argv.slice(2)
const userId=Number(userIdText)
if (!['plan','apply'].includes(mode) || !Number.isSafeInteger(userId) || userId<1 || !file || (mode==='apply'&&!backupDirectory)) {
  throw new Error('Usage: node scripts/migrate-reference-assignments.mjs plan <user-id> <new-plan.json> | apply <user-id> <existing-plan.json> <private-backup-directory>')
}
const url=new URL(process.env.DATABASE_URL || '')
const databaseFingerprint=createHash('sha256').update(url.hostname+':'+url.port+url.pathname).digest('hex')
const source=JSON.parse(await readFile(new URL('../src/data/item-reference-assignments.json',import.meta.url)))
const aliases=buildReferenceAliases(source,JSON.parse(await readFile(new URL('../src/data/items.json',import.meta.url))),JSON.parse(await readFile(new URL('../src/data/college-tag-aliases.json',import.meta.url))))
async function durableJson(file, value) {
  const handle=await open(file,'wx',0o600)
  try {await handle.writeFile(JSON.stringify(value,null,2));await handle.sync()} finally {await handle.close()}
}
const pool=new pg.Pool({connectionString:url.toString()})
try {
  if(mode==='plan') {
    const client=await pool.connect();let plan
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      const row=(await client.query('SELECT version,storage_version FROM user_state WHERE user_id=$1',[userId])).rows[0]
      if(Number(row?.storage_version)!==2)throw new Error('A validated storage-v2 account is required; this command performs no storage upgrade.')
      const rows=(await client.query('SELECT item_number,data FROM user_tracking_items WHERE user_id=$1',[userId])).rows
      const result=planReferenceTransition({items:Object.fromEntries(rows.map(row=>[row.item_number,row.data]))},source,aliases,new Date().toISOString())
      plan={userId,baseVersion:Number(row.version),databaseFingerprint,sourceSha256:source.provenance.sourceSha256,preparedAt:new Date().toISOString(),reports:result.reports}
      await client.query('COMMIT')
    } catch(error) {await client.query('ROLLBACK');throw error} finally {client.release()}
    await durableJson(resolve(file),plan)
    console.log(JSON.stringify({mode,userId,version:plan.baseVersion,items:plan.reports.length,changed:plan.reports.filter(r=>r.assignmentsChanged).length,productionDataWritten:false}))
  } else {
    const plan=JSON.parse(await readFile(file))
    if(plan.userId!==userId||plan.databaseFingerprint!==databaseFingerprint||plan.sourceSha256!==source.provenance.sourceSha256)throw new Error('Plan/account/database/source mismatch; prepare a new plan.')
    const directory=resolve(backupDirectory);await mkdir(directory,{recursive:true,mode:0o700})
    const backup=join(directory,`reference-before-${userId}-${randomUUID()}.json`)
    const store=createStateStore(pool)
    const result=await store.transitionReferences(userId,{baseVersion:plan.baseVersion,source,resolveAlias:aliases,
      backupBeforeWrite:value=>durableJson(backup,value)})
    await durableJson(join(directory,`reference-result-${userId}-${randomUUID()}.json`),result)
    console.log(JSON.stringify({mode,userId,changed:result.changed,version:result.version,items:result.reports.length,backup:result.changed?backup:null}))
  }
} finally {await pool.end()}
