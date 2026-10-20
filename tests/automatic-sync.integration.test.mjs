import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import jwt from 'jsonwebtoken'
import { defaultState } from '../server/state-model.mjs'
import { diffOperations } from '../shared/sync-protocol.mjs'
const secret = 'local-automatic-sync-test-secret-only-0123456789'
let cluster,pool,api,server,directory,connectionString
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p}
export const state = () => ({...defaultState(),profile:{firstName:'Test'},trackingState:{items:{
  1:{itemComment:'original',quizCount:3,quiz:{cards:[{id:'card-a',question:'Q',answer:'A',quizCount:3,lastResult:'good'}]}},
  2:{itemComment:'untouched',quiz:{cards:[]}}
}}})
async function user(){return Number((await pool.query("INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,'Sync','unused',$2) RETURNING id",[crypto.randomUUID()+'@example.test',new Date().toISOString()])).rows[0].id)}
async function request(uid,method,url,body){const r=await fetch(api+url,{method,headers:{Authorization:'Bearer '+jwt.sign({uid,email:'test@example.test'},secret,{expiresIn:'45m'}),'Content-Type':'application/json','x-client-version':'0.1.1'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}}
const op=(type,path,value)=>({id:crypto.randomUUID(),type,path,...(value!==undefined?{value}:{})})
const root=['trackingState','items','1'];const card=[...root,'quiz','cards','@card-a']
const write=(uid,operations,since=1)=>request(uid,'POST','/api/sync',{operations,since})
async function seed(){const uid=await user();const r=await request(uid,'PUT','/api/state',{...state(),baseVersion:0,requestId:crypto.randomUUID()});assert.equal(r.status,200,JSON.stringify(r.body));return uid}
test.before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'itemstracker-state-test-'))
  const port = await freePort()
  cluster = new EmbeddedPostgres({ databaseDir: path.join(directory, 'pg'), port, user: 'postgres', password: 'local-only', persistent: false,
    postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} })
  await cluster.initialise(); await cluster.start()
  connectionString = `postgresql://postgres:local-only@127.0.0.1:${port}/postgres`
  pool = new pg.Pool({ connectionString })
  const apiPort = await freePort()
  api = `http://127.0.0.1:${apiPort}`
  let output = ''
  server = spawn(process.execPath, ['--max-old-space-size=128', 'server/index.mjs'], { env: { ...process.env, DATABASE_URL: connectionString, JWT_SECRET: secret, PORT: String(apiPort),
    BOOTSTRAP_EMAIL: '', BOOTSTRAP_PASSWORD: '', MEDIA_S3_BUCKET: '', APP_VERSION: '0.1.0', MIN_CLIENT_VERSION: '0.1.0', STORAGE_LIMIT_BYTES: '20000000', STATE_WRITE_LIMIT_PER_MIN: '10000', AUTOMATIC_SYNC_ENABLED: 'true', ANALYTICS_GEO_DOWNLOAD: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', data => { output += data }); server.stderr.on('data', data => { output += data })
  for (let attempt = 0; attempt < 200; attempt++) {
    if (server.exitCode !== null) throw new Error(output)
    try { if ((await fetch(`${api}/api/health`)).ok) break } catch { await delay(50) }
    if (attempt === 199) throw new Error(`Server failed to start: ${output}`)
  }
})
test.after(async () => {
  if (server?.exitCode === null && server?.signalCode === null) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)) }
  if (pool) await pool.end()
  if (cluster) await cluster.stop()
  if (directory) await rm(directory, { recursive: true, force: true })
})


test('two sessions edit different fields and items without a version precondition',async()=>{
 const uid=await seed();const a=op('set',[...card,'question'],'Mac question');const b=op('set',[...card,'answer'],'Phone answer');
 const result=await Promise.all([write(uid,[a]),write(uid,[b])]);assert.deepEqual(result.map(x=>x.status),[200,200]);
 const read=await request(uid,'GET','/api/sync');assert.equal(read.body.state.trackingState.items[1].quiz.cards[0].question,'Mac question');assert.equal(read.body.state.trackingState.items[1].quiz.cards[0].answer,'Phone answer');
 const noChange=await request(uid,'GET','/api/sync?since='+read.body.version);assert.equal(noChange.body.unchanged,true);
 const next=await write(uid,[op('set',[...root,'itemComment'],'new')],read.body.version);assert.equal(next.body.full,false);assert.deepEqual(next.body.selectedItems,[1]);assert.equal(next.body.state.trackingState.items[2],undefined)
})
test('review events are additive and exactly once after a lost acknowledgement, even after legacy retention',async()=>{
 const uid=await seed();const a=op('increment',[...card,'quizCount'],1),b=op('increment',[...card,'quizCount'],1);
 await Promise.all([write(uid,[a]),write(uid,[b])]);await write(uid,[a]);await write(uid,[b]);
 const read=await request(uid,'GET','/api/sync');assert.equal(read.body.state.trackingState.items[1].quiz.cards[0].quizCount,5);assert.equal(read.body.state.trackingState.items[1].quizCount,5);
 assert.equal((await pool.query('SELECT COUNT(*) FROM user_sync_operations WHERE user_id=$1',[uid])).rows[0].count,'2');
 await pool.query("UPDATE user_sync_operations SET created_at=NOW()-INTERVAL '100 days' WHERE user_id=$1",[uid]);await write(uid,[a]);
 assert.equal((await request(uid,'GET','/api/sync')).body.version,read.body.version)
})
test('last server-accepted scalar edit wins, retries never win again, and history is recoverable and account-scoped',async()=>{
 const uid=await seed();const a=op('set',[...card,'answer'],'Mac'),b=op('set',[...card,'answer'],'Phone');
 await write(uid,[a]);await write(uid,[b]);await write(uid,[a]);
 assert.equal((await request(uid,'GET','/api/sync')).body.state.trackingState.items[1].quiz.cards[0].answer,'Phone');
 const history=await request(uid,'GET','/api/sync/history');assert.equal(history.body.entries[0].previous_value,'Mac');
 const restore=await request(uid,'POST','/api/sync/history/'+b.id+'/restore',{requestId:crypto.randomUUID()});assert.equal(restore.status,200);assert.equal(restore.body.state.trackingState.items[1].quiz.cards[0].answer,'Mac');
 const other=await user();assert.equal((await request(other,'GET','/api/sync/history')).body.entries.length,0);assert.equal((await request(other,'POST','/api/sync/history/'+b.id+'/restore',{requestId:crypto.randomUUID()})).status,404)
})
test('concurrent creations preserve both IDs; deletion cannot be undone by stale edits or stale creates',async()=>{
 const uid=await seed();const cards=[...root,'quiz','cards'];
 await Promise.all([write(uid,[op('create',[...cards,'@new-a'],{id:'new-a',answer:'Mac'})]),write(uid,[op('create',[...cards,'@new-b'],{id:'new-b',answer:'Phone'})])]);
 assert.equal((await request(uid,'GET','/api/sync')).body.state.trackingState.items[1].quiz.cards.length,3);
 const deletion=op('delete',card);await write(uid,[deletion]);await write(uid,[op('set',[...card,'answer'],'stale')]);await write(uid,[op('create',card,{id:'card-a',answer:'stale'})]);
 assert.equal((await request(uid,'GET','/api/sync')).body.state.trackingState.items[1].quiz.cards.some(c=>c.id==='card-a'),false);
 const restored=await request(uid,'POST','/api/sync/history/'+deletion.id+'/restore',{requestId:crypto.randomUUID()});assert.equal(restored.body.state.trackingState.items[1].quiz.cards.find(c=>c.id==='card-a').answer,'A')
})
test('invalid requests and reused IDs are atomic; legacy changes force a full refresh',async()=>{
 const uid=await seed(),a=op('set',[...root,'itemComment'],'accepted');await write(uid,[a]);
 assert.equal((await write(uid,[{...a,value:'different'}])).status,409);
 const before=await request(uid,'GET','/api/sync');
 assert.equal((await write(uid,[op('set',['theme'],'invalid-theme')])).status,400);assert.equal((await request(uid,'GET','/api/sync')).body.version,before.body.version);
 await request(uid,'PATCH','/api/state',{baseVersion:before.body.version,requestId:crypto.randomUUID(),patch:{theme:'dark'}});
 const after=await request(uid,'GET','/api/sync?since='+before.body.version);assert.equal(after.body.full,true);assert.equal(after.body.state.theme,'dark');
 assert.ok(diffOperations(state(),{...state(),theme:'dark'}).every(op=>op.id))
})
test('image replacement, removal, deletion and history restore preserve private media',async()=>{
 const uid=await seed(),one='data:image/png;base64,aGVsbG8=',two='data:image/png;base64,d29ybGQ='
 await request(uid,'POST','/api/state/images',{baseVersion:1,requestId:crypto.randomUUID(),upsert:[{itemNumber:1,cardId:'card-a',imageSlot:'front',imageDataUrl:one}]})
 const change=op('set',[...card,'frontImageDataUrl'],two)
 assert.equal((await write(uid,[change])).status,200)
 assert.equal((await request(uid,'GET','/api/state/images/1/card-a')).body.frontImageDataUrl,two)
 assert.equal((await request(uid,'GET','/api/sync/history')).body.entries[0].previous_value,one)
 await request(uid,'POST','/api/sync/history/'+change.id+'/restore',{requestId:crypto.randomUUID()})
 assert.equal((await request(uid,'GET','/api/state/images/1/card-a')).body.frontImageDataUrl,one)
 const remove=op('set',[...card,'frontImageDataUrl'],'')
 await write(uid,[remove,op('set',[...card,'hasFrontImageDataUrl'],false)])
 assert.equal((await request(uid,'GET','/api/state/images/1/card-a')).body.frontImageDataUrl,'')
 await request(uid,'POST','/api/sync/history/'+remove.id+'/restore',{requestId:crypto.randomUUID()})
 assert.equal((await request(uid,'GET','/api/state/images/1/card-a')).body.frontImageDataUrl,one)
 const deletion=op('delete',card);await write(uid,[deletion]);
 await request(uid,'POST','/api/sync/history/'+deletion.id+'/restore',{requestId:crypto.randomUUID()})
 assert.equal((await request(uid,'GET','/api/state/images/1/card-a')).body.frontImageDataUrl,one)
})
test('unrelated edits preserve historical counters that predate the current card list',async()=>{
 const uid=await user(),data=state();data.trackingState.items[1].quizCount=40
 await request(uid,'PUT','/api/state',{...data,baseVersion:0,requestId:crypto.randomUUID()})
 await write(uid,[op('set',['theme'],'dark')]);assert.equal((await request(uid,'GET','/api/sync')).body.state.trackingState.items[1].quizCount,40)
 await write(uid,[op('increment',[...card,'quizCount'],1)]);assert.equal((await request(uid,'GET','/api/sync')).body.state.trackingState.items[1].quizCount,41)
})
test('avatar removal and its history restore use private immutable media',async()=>{
 const uid=await seed(),image='data:image/png;base64,aGVsbG8='
 await write(uid,[op('set',['profile','photoUrl'],image)])
 assert.equal((await request(uid,'GET','/api/sync')).body.state.profile.photoUrl,image)
 const removal=op('set',['profile','photoUrl'],'');await write(uid,[removal])
 assert.equal((await request(uid,'GET','/api/sync')).body.state.profile.photoUrl,'')
 await request(uid,'POST','/api/sync/history/'+removal.id+'/restore',{requestId:crypto.randomUUID()})
 assert.equal((await request(uid,'GET','/api/sync')).body.state.profile.photoUrl,image)
})
test('startup receipt lookup removes already committed local operations without replaying their effects',async()=>{
 const uid=await seed(),review=op('increment',[...card,'quizCount'],1)
 await write(uid,[review]);const version=(await request(uid,'GET','/api/sync')).body.version
 const check=await request(uid,'POST','/api/sync/receipts',{ids:[review.id,crypto.randomUUID()]})
 assert.equal(check.status,200);assert.deepEqual(check.body.acknowledged,[review.id]);assert.equal(check.body.version,version)
 assert.equal(check.body.state.trackingState.items[1].quiz.cards[0].quizCount,4)
 const other=await user();assert.deepEqual((await request(other,'POST','/api/sync/receipts',{ids:[review.id]})).body.acknowledged,[])
})
