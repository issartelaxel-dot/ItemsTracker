// Real API + PostgreSQL + the built test UI. No production account or API.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtemp,rm,readFile} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import http from 'node:http'
import express from 'express'
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import jwt from 'jsonwebtoken'
import {webkit,chromium,expect} from '@playwright/test'
import {defaultState} from '../server/state-model.mjs'
const freePort=async()=>{const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p}
const secret='only-local-multidevice-browser-test-0123456789'
let cluster,pool,server,web,desktopBrowser,phoneBrowser,directory,debug
try{
 directory=await mkdtemp(path.join(os.tmpdir(),'itemstracker-sync-browser-'))
 const dbPort=await freePort(),apiPort=await freePort(),webPort=await freePort(),base=`http://127.0.0.1:${webPort}`
 cluster=new EmbeddedPostgres({databaseDir:path.join(directory,'pg'),port:dbPort,user:'postgres',password:'local-only',persistent:false,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}})
 await cluster.initialise();await cluster.start();const connectionString=`postgresql://postgres:local-only@127.0.0.1:${dbPort}/postgres`
 pool=new pg.Pool({connectionString});let output=''
 server=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,DATABASE_URL:connectionString,JWT_SECRET:secret,PORT:String(apiPort),HOST:'127.0.0.1',CLIENT_ORIGIN:base,CLIENT_ORIGINS:base,COOKIE_SECURE:'false',APP_VERSION:'0.1.1',MIN_CLIENT_VERSION:'0.1.0',BOOTSTRAP_EMAIL:'',BOOTSTRAP_PASSWORD:'',AUTOMATIC_SYNC_ENABLED:'true',ACADEMIC_ONBOARDING_ENABLED:'false',ANALYTICS_GEO_DOWNLOAD:'false',STATE_WRITE_LIMIT_PER_MIN:'10000',MEDIA_S3_BUCKET:''},stdio:['ignore','pipe','pipe']})
 server.stdout.on('data',x=>output+=x);server.stderr.on('data',x=>output+=x)
 for(let n=0;n<150;n++){if(server.exitCode!==null)throw Error(output);try{if((await fetch(`http://127.0.0.1:${apiPort}/api/health`)).ok)break}catch{}await new Promise(r=>setTimeout(r,50))}
 const uid=Number((await pool.query("INSERT INTO users(email,display_name,password_hash,created_at) VALUES('sync-browser@example.test','Sync Browser','unused',$1) RETURNING id",[new Date().toISOString()])).rows[0].id)
 const token=jwt.sign({uid,email:'sync-browser@example.test'},secret,{expiresIn:'45m'})
 const headers={Authorization:'Bearer '+token,'content-type':'application/json','x-client-version':'0.1.1'}
 const initial={...defaultState(),profile:{firstName:'Sync',lastName:'Browser',email:'sync-browser@example.test',photoUrl:'',password:'',avatarGradient:'red'},trackingState:{items:{1:{assignedColleges:['Médecine Interne'],quiz:{enabled:true,activeCardId:'qa-a',cards:[{id:'qa-a',question:'<p>Initial question</p>',answer:'<p>Initial answer</p>',quizCount:0,lastResult:null,lastReviewedAt:null}]}}}}}
 if(process.env.SYNC_SCALE_EXPORT){const exported=JSON.parse(await readFile(process.env.SYNC_SCALE_EXPORT,'utf8')).data;initial.trackingState.items={...exported.trackingState.items,...initial.trackingState.items}}
 const seed=await fetch(`http://127.0.0.1:${apiPort}/api/state`,{method:'PUT',headers,body:JSON.stringify({...initial,baseVersion:0,requestId:crypto.randomUUID()})});assert.equal(seed.status,200)
 const legacyLocal=structuredClone(initial);legacyLocal.trackingState.items[1].quiz.cards[0].quizCount=1;legacyLocal.trackingState.items[1].quizCount=1
 const legacyId=crypto.randomUUID(),legacyBody=JSON.stringify({...legacyLocal,baseVersion:1,requestId:legacyId})
 const legacyCommitted=await fetch(`http://127.0.0.1:${apiPort}/api/state`,{method:'PUT',headers,body:legacyBody});assert.equal(legacyCommitted.status,200)
 const legacyDraft={key:`${uid}:old-tab`,userId:uid,body:JSON.stringify(legacyLocal),baseBody:JSON.stringify(initial),baseVersion:1,imageBaseline:{},imageVersions:{},operation:{id:legacyId,path:'/api/state',method:'PUT',body:legacyBody,targetBody:JSON.stringify(legacyLocal)},savedAtMs:Date.now()}

 const app=express();app.use('/api',(req,res)=>{const upstream=http.request({hostname:'127.0.0.1',port:apiPort,path:req.originalUrl,method:req.method,headers:{...req.headers,host:`127.0.0.1:${apiPort}`}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res)});upstream.on('error',()=>res.sendStatus(502));req.pipe(upstream)})
 app.get('/preview-session.js',(_req,res)=>res.type('js').send(''))
 app.use(express.static('.test-preview-dist',{index:false}));app.get(['/', '/app.html'],(_req,res)=>res.sendFile(path.resolve('.test-preview-dist/ops/test-preview/index.html'),{dotfiles:'allow'}))
 web=app.listen(webPort,'127.0.0.1');await new Promise(r=>web.once('listening',r))
 desktopBrowser=await webkit.launch({headless:true});phoneBrowser=process.env.SYNC_PHONE_ENGINE==='webkit'?await webkit.launch({headless:true}):await chromium.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})})
 const errors=[],requests=[],responses=[],expectedNetworkErrors=[];const abortTickets=new Map();const abortRequest=route=>{const ctx=route.request().frame().page().context();abortTickets.set(ctx,(abortTickets.get(ctx)||0)+1);return route.abort('internetdisconnected')}
 async function device(browser,mobile){const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:mobile?390:1440,height:900},isMobile:mobile,hasTouch:mobile});await context.addInitScript(({token})=>localStorage.setItem('med_auth_token',token),{token});if(!mobile)await context.addInitScript(async({base,draft})=>{if(location.origin!==base||localStorage.getItem('legacy-seeded'))return;const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('itemstracker-save-recovery',1);req.onupgradeneeded=()=>req.result.createObjectStore('drafts',{keyPath:'key'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(draft);tx.oncomplete=resolve;tx.onerror=reject});db.close();localStorage.setItem('legacy-seeded','true')},{base,draft:legacyDraft});const page=await context.newPage();page.on('pageerror',e=>{const tickets=abortTickets.get(context)||0;if(tickets>0&&e.message.includes('/api/')&&e.message.includes('due to access control checks.')){abortTickets.set(context,tickets-1);expectedNetworkErrors.push(e.message)}else errors.push(e.message)});page.on('response',async r=>{if(r.url().includes('/api/sync')){try{const body=await r.json();responses.push({status:r.status(),version:body.version,unchanged:body.unchanged,ack:body.acknowledged?.length,error:body.code})}catch{}}});page.on('request',r=>{if(r.url().includes('/api/sync')&&r.method()==='POST')requests.push(r.postDataJSON())});await page.goto(base);await expect(page.locator('.dashboard-home')).toBeVisible({timeout:20000});return {context,page,mobile}}
 const mac=await device(desktopBrowser,false),phone=await device(phoneBrowser,true)
 async function editor(d,side='Recto'){await d.page.bringToFront();const nav=d.page.locator(d.mobile?'.mobile-bottom-nav':'.dashboard-sidebar');await nav.getByRole('button',{name:'Items',exact:true}).click();await d.page.locator('.items-list-row').filter({has:d.page.locator('.items-list-number',{hasText:/^#1$/})}).click();await d.page.locator('.item-detail-tabs').getByRole('button',{name:'Flashcards',exact:true}).click();await d.page.locator('.quiz-card-edit').first().click().catch(async e=>{await d.page.screenshot({path:'/tmp/itemstracker-sync-editor-failure.png'});throw e});const modal=d.page.locator('.flashcard-editor-modal');await expect(modal).toBeVisible();await modal.locator('.flashcard-editor-tabs').getByRole('button',{name:side,exact:true}).click();return modal.locator('.quiz-rich-editable')}
 assert.equal((await pool.query("SELECT (data->>'quizCount')::int AS count FROM user_quiz_cards WHERE user_id=$1 AND card_id='qa-a'",[uid])).rows[0].count,1)
 console.log('PASS real UI: legacy lost-ACK draft migrates without double counting')
 async function concurrentActions(actions){
  for(const d of [mac,phone])await expect(d.page.locator('header [role="status"]')).toHaveText('Enregistré',{timeout:25000})
  let queued=0,release
  const handlers=[]
  const barrier=new Promise(resolve=>{release=resolve})
  const hold=route=>{const task=(async()=>{if(route.request().method()==='POST'){queued++;await barrier}await route.continue()})();handlers.push(task);return task}
  await mac.context.route('**/api/sync',hold);await phone.context.route('**/api/sync',hold)
  try{
   // WebKit input focus is global on macOS: enter actions sequentially, but
   // hold both writes so the server sees genuinely concurrent snapshots.
   for(const [index,action]of actions.entries()){await action();await expect.poll(()=>queued,{timeout:20000}).toBeGreaterThanOrEqual(index+1)}
  }finally{release();await Promise.all(handlers);await mac.context.unroute('**/api/sync',hold);await phone.context.unroute('**/api/sync',hold)}
 }
 const a=await editor(mac),b=await editor(phone,'Verso')
 if(process.env.SYNC_SCALE_EXPORT)console.log('Scale browser visibility',JSON.stringify({mac:await mac.page.evaluate(()=>document.visibilityState),phone:await phone.page.evaluate(()=>document.visibilityState)}))
 const saved=async()=>{const r=await fetch(`http://127.0.0.1:${apiPort}/api/sync`,{headers});return r.json()}
 const card=async()=> {const c=(await saved()).state.trackingState.items[1].quiz.cards.find(c=>c.id==='qa-a');return {...c,question:c.question.replace(/<[^>]*>/g,''),answer:c.answer.replace(/<[^>]*>/g,'')}}
 debug=async()=>({serverTheme:(await saved()).state.theme,mac:await mac.page.evaluate(()=>({visibility:document.visibilityState,status:document.querySelector('header [role=status]')?.textContent})),phone:await phone.page.evaluate(()=>({visibility:document.visibilityState,status:document.querySelector('header [role=status]')?.textContent})),server:await card(),errors,responses:responses.slice(-12),operations:requests.flatMap(r=>(r.operations||[]).filter(op=>op.path.includes('@qa-a')&&['question','answer','theme'].includes(op.path.at(-1))))})
 await concurrentActions([()=>a.fill('Question depuis Safari'),()=>b.fill('Réponse depuis téléphone')])
 await expect.poll(async()=>({q:(await card()).question,a:(await card()).answer}),{timeout:15000}).toEqual({q:'Question depuis Safari',a:'Réponse depuis téléphone'})
 console.log('PASS real UI: independent simultaneous fields, Safari + phone')
 await mac.page.locator('.flashcard-editor-tabs').getByRole('button',{name:'Verso',exact:true}).click()
 await expect(a).toHaveText('Réponse depuis téléphone',{timeout:10000})
 await a.fill('Première édition');await expect.poll(async()=>(await card()).answer,{timeout:20000}).toBe('Première édition')
 await b.fill('Dernière édition');await expect.poll(async()=>(await card()).answer,{timeout:20000}).toBe('Dernière édition');await expect(a).toHaveText('Dernière édition',{timeout:20000}).catch(async error=>{console.log('CONVERGENCE DIAGNOSTIC',JSON.stringify({mac:await mac.page.evaluate(()=>({visibility:document.visibilityState,focused:document.hasFocus()})),phone:await phone.page.evaluate(()=>({visibility:document.visibilityState,focused:document.hasFocus()})),server:await card(),responses:responses.slice(-10),lastOperations:requests.slice(-4).map(r=>(r.operations||[]).filter(op=>op.path.includes('@qa-a')))}));throw error})
 console.log('PASS real UI: deterministic same-field convergence')
 // Simulate an unreachable API while the app and persistent browser storage stay available.
 await mac.context.route('**/api/**',route=>abortRequest(route))
 await a.fill('Modification hors ligne Safari')
 await expect(mac.page.getByRole('status').filter({hasText:'Hors connexion'})).toBeVisible({timeout:15000})
 await b.fill('Modification téléphone pendant coupure');await expect.poll(async()=>(await card()).answer,{timeout:20000}).toBe('Modification téléphone pendant coupure')
 await mac.page.reload();await expect(mac.page.locator('.dashboard-home')).toBeVisible({timeout:20000})
 const restored=await editor(mac,'Verso');await expect(restored).toHaveText('Modification hors ligne Safari')
 await mac.context.unroute('**/api/**');await mac.page.evaluate(()=>window.dispatchEvent(new Event('online')))
 await expect.poll(async()=>(await card()).answer,{timeout:15000}).toBe('Modification hors ligne Safari');await expect(b).toHaveText('Modification hors ligne Safari',{timeout:15000})
 console.log('PASS real UI: offline edits survive reload and converge after reconnect')
 // The server commits; drop only the acknowledgement. Reload must replay the same IDs.
 let dropped=false,ids
 await phone.context.route('**/api/sync',async route=>{if(route.request().method()!=='POST'||dropped)return route.continue();dropped=true;ids=route.request().postDataJSON().operations.map(op=>op.id);await route.fetch();await abortRequest(route)})
 await b.fill('Sauvegarde sans accusé');await expect.poll(()=>dropped).toBe(true);await expect.poll(async()=>(await card()).answer,{timeout:20000}).toBe('Sauvegarde sans accusé')
 await phone.page.reload();await expect(phone.page.locator('.dashboard-home')).toBeVisible({timeout:20000});await phone.context.unroute('**/api/sync');await phone.page.evaluate(()=>window.dispatchEvent(new Event('online')))
 await expect.poll(async()=>{const r=await pool.query('SELECT COUNT(*) FROM user_sync_operations WHERE user_id=$1 AND operation_id=ANY($2::text[])',[uid,ids]);return Number(r.rows[0].count)},{timeout:10000}).toBe(ids.length)
 // Actual review controls on both devices must append independent events.
 await editor(phone,'Verso')
 const macModal=mac.page.locator('.flashcard-editor-modal'),phoneModal=phone.page.locator('.flashcard-editor-modal')
 const beforeReviews=(await card()).quizCount
 await concurrentActions([()=>macModal.getByRole('button',{name:'Facile',exact:true}).click(),()=>phoneModal.getByRole('button',{name:'Difficile',exact:true}).click()])
 await expect.poll(async()=>(await card()).quizCount,{timeout:15000}).toBe(beforeReviews+2)
 abortTickets.set(phone.context,(abortTickets.get(phone.context)||0)+100)
 await phone.context.setOffline(true)
 await phoneModal.getByRole('button',{name:'Facile',exact:true}).click()
 await phoneModal.getByRole('button',{name:'Très facile',exact:true}).click()
 await macModal.getByRole('button',{name:'Facile',exact:true}).click()
 await expect.poll(async()=>(await card()).quizCount,{timeout:15000}).toBe(beforeReviews+3)
 await phone.context.setOffline(false)
 await expect.poll(async()=>(await card()).quizCount,{timeout:15000}).toBe(beforeReviews+5)
 console.log('PASS real UI: simultaneous and offline review events add up exactly once')
 // New entities are merged by stable ID rather than replacing a card array.
 await phoneModal.getByRole('button',{name:'Actions de la flashcard',exact:true}).click()
 await concurrentActions([()=>macModal.getByRole('button',{name:'Dupliquer',exact:true}).click(),()=>phoneModal.getByRole('button',{name:'Dupliquer',exact:true}).click()])
 await expect.poll(async()=>(await saved()).state.trackingState.items[1].quiz.cards.length,{timeout:15000}).toBe(3)
 console.log('PASS real UI: simultaneous card creation preserves both new cards')
 await macModal.getByRole('button',{name:'Fermer',exact:true}).click()
 await mac.page.getByRole('button',{name:'Activer le thème sombre'}).click()
 await expect(phone.page.locator('html')).toHaveAttribute('data-theme','dark',{timeout:15000})
 console.log('PASS real UI: preferences update the other device automatically')
 await mac.page.getByRole('button',{name:'Ouvrir les réglages',exact:true}).click()
 await mac.page.getByRole('button',{name:'Consulter l’historique',exact:true}).click()
 const answerHistory=mac.page.locator('.automatic-sync-history li').filter({hasText:'Réponse'}).first()
 await expect(mac.page.getByRole('button',{name:'Consulter l’historique',exact:true})).toBeEnabled()
 for(let page=0;page<10&&!await answerHistory.count();page++){
  const more=mac.page.getByRole('button',{name:'Modifications plus anciennes',exact:true})
  if(!await more.count())break
  await more.click();await expect(more).toBeEnabled()
 }
 await expect(answerHistory).toBeVisible({timeout:10000})
 const expected=(await pool.query("SELECT previous_value FROM user_sync_operations WHERE user_id=$1 AND operation->'path'->>-1='answer' ORDER BY sequence DESC LIMIT 1",[uid])).rows[0].previous_value.replace(/<[^>]*>/g,'')
 await answerHistory.getByRole('button',{name:'Rétablir la version précédente',exact:true}).click()
 await expect.poll(async()=>(await card()).answer,{timeout:process.env.SYNC_SCALE_EXPORT?45000:15000}).toBe(expected)
 console.log('PASS real UI: content history can be restored through settings')
 assert.equal(await mac.page.getByRole('button',{name:'Synchroniser',exact:true}).count(),0);assert.equal(await phone.page.locator('.save-lock-banner').count(),0)
 assert.deepEqual(errors,[]);assert.ok(requests.length>0)
 console.log('PASS real UI: lost ACK replay, no manual sync or reload protection banner')
 if(expectedNetworkErrors.length)console.log('Expected WebKit errors from deliberate network aborts:',expectedNetworkErrors.length)
 await mac.context.close();await phone.context.close()
}catch(error){console.log('FAILED ASSERTION',error.message);if(debug){try{console.log('SYNC DIAGNOSTIC',JSON.stringify(await debug()))}catch{}}throw error}finally{await desktopBrowser?.close();await phoneBrowser?.close();if(web)await new Promise(r=>web.close(r));if(server?.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r))}await pool?.end();if(cluster)await cluster.stop();if(directory)await rm(directory,{recursive:true,force:true})}
