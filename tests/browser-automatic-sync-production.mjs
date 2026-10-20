// Production verification. Use only a newly provisioned temporary QA account.
// SYNC_PRODUCTION_CREDENTIALS points to a private JSON file with base, uid, token and
// api, app URL. Provision/delete the QA account separately; never commit tokens.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {webkit,chromium,expect} from '@playwright/test'
import {defaultState} from '../server/state-model.mjs'
let desktopBrowser,phoneBrowser,debug
try{
 const credentials=JSON.parse(await readFile(process.env.SYNC_PRODUCTION_CREDENTIALS,'utf8'))
 const {base,uid,token,api,app:appUrl}=credentials
 assert.ok(credentials.email?.startsWith('production-sync-qa-'),'Use only a temporary QA account')
 assert.equal(base,'https://setup-hub.com');assert.equal(api,'https://api.setup-hub.com');assert.equal(appUrl,base+'/itemstracker/app.html')
 const headers={Authorization:'Bearer '+token,'content-type':'application/json','x-client-version':'0.1.1'}
 const initial={...defaultState(),profile:{firstName:'Sync',lastName:'QA',email:'sync-qa-20261020@example.test',photoUrl:'',password:'',avatarGradient:'red'},trackingState:{items:{1:{assignedColleges:['Médecine Interne'],quizCount:1,quiz:{enabled:true,activeCardId:'qa-a',cards:[{id:'qa-a',question:'<p>Initial question</p>',answer:'<p>Initial answer</p>',quizCount:1,lastResult:null,lastReviewedAt:null}]}}}}}
 const seed=await fetch(api+'/api/state',{method:'PUT',headers,body:JSON.stringify({...initial,baseVersion:0,requestId:crypto.randomUUID()})});assert.equal(seed.status,200)
 desktopBrowser=await webkit.launch({headless:true});phoneBrowser=process.env.SYNC_PHONE_ENGINE==='webkit'?await webkit.launch({headless:true}):await chromium.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})})
 const errors=[],requests=[],responses=[],expectedNetworkErrors=[];const abortTickets=new Map();const abortRequest=route=>{const ctx=route.request().frame().page().context();abortTickets.set(ctx,(abortTickets.get(ctx)||0)+1);return route.abort('internetdisconnected')}
 async function device(browser,mobile){const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:mobile?390:1440,height:900},isMobile:mobile,hasTouch:mobile});await context.addInitScript(({token})=>localStorage.setItem('med_auth_token',token),{token});const page=await context.newPage();page.on('pageerror',e=>{const tickets=abortTickets.get(context)||0;if(tickets>0&&e.message.includes('/api/')&&e.message.includes('due to access control checks.')){abortTickets.set(context,tickets-1);expectedNetworkErrors.push(e.message)}else errors.push(e.message)});page.on('response',async r=>{if(r.url().includes('/api/sync')){try{const body=await r.json();responses.push({status:r.status(),version:body.version,unchanged:body.unchanged,ack:body.acknowledged?.length,error:body.code})}catch{}}});page.on('request',r=>{if(r.url().includes('/api/sync')&&r.method()==='POST')requests.push(r.postDataJSON())});await page.goto(appUrl);await expect(page.locator('.dashboard-home')).toBeVisible({timeout:20000});return {context,page,mobile}}
 const mac=await device(desktopBrowser,false),phone=await device(phoneBrowser,true)
 async function editor(d,side='Recto'){await d.page.bringToFront();const nav=d.page.locator(d.mobile?'.mobile-bottom-nav':'.dashboard-sidebar');await nav.getByRole('button',{name:'Items',exact:true}).click();await d.page.locator('.items-list-row').filter({has:d.page.locator('.items-list-number',{hasText:/^#1$/})}).click();await d.page.locator('.item-detail-tabs').getByRole('button',{name:'Flashcards',exact:true}).click();await d.page.locator('.quiz-card-edit').first().click().catch(async e=>{await d.page.screenshot({path:'/tmp/itemstracker-sync-editor-failure.png'});throw e});const modal=d.page.locator('.flashcard-editor-modal');await expect(modal).toBeVisible();await modal.locator('.flashcard-editor-tabs').getByRole('button',{name:side,exact:true}).click();return modal.locator('.quiz-rich-editable')}
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
 const saved=async()=>{const r=await fetch(api+'/api/sync',{headers});return r.json()}
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
 await expect.poll(async()=>{const r=await fetch(api+'/api/sync/history',{headers});const h=await r.json();return h.entries.filter(e=>ids.includes(e.operation_id)).length},{timeout:10000}).toBe(ids.length)
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
 let history=await (await fetch(api+'/api/sync/history',{headers})).json();while(!history.entries.some(e=>e.operation.path.at(-1)==='answer')&&history.next)history=await (await fetch(api+'/api/sync/history?before='+history.next,{headers})).json();const expected=history.entries.find(e=>e.operation.path.at(-1)==='answer').previous_value.replace(/<[^>]*>/g,'')
 await answerHistory.getByRole('button',{name:'Rétablir la version précédente',exact:true}).click()
 await expect.poll(async()=>(await card()).answer,{timeout:15000}).toBe(expected)
 console.log('PASS real UI: content history can be restored through settings')
 assert.equal(await mac.page.getByRole('button',{name:'Synchroniser',exact:true}).count(),0);assert.equal(await phone.page.locator('.save-lock-banner').count(),0)
 assert.deepEqual(errors,[]);assert.ok(requests.length>0)
 console.log('PASS real UI: lost ACK replay, no manual sync or reload protection banner')
 const replica=page=>page.evaluate(async uid=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('itemstracker-automatic-sync',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const records=await new Promise((resolve,reject)=>{const tx=db.transaction('clients'),r=tx.objectStore('clients').getAll();tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error)});db.close();const state=records.filter(r=>String(r.userId)===String(uid)).sort((a,b)=>b.version-a.version||b.savedAt-a.savedAt)[0].base;const cards=state.trackingState.items[1].quiz.cards;const card=cards.find(c=>c.id==='qa-a');return {theme:state.theme,ids:cards.map(c=>c.id).sort(),answer:card.answer.replace(/<[^>]*>/g,''),count:card.quizCount}},uid)
 const canonical=await saved(),cards=canonical.state.trackingState.items[1].quiz.cards,c=cards.find(c=>c.id==='qa-a');const target={theme:canonical.state.theme,ids:cards.map(c=>c.id).sort(),answer:c.answer.replace(/<[^>]*>/g,''),count:c.quizCount}
 await expect.poll(async()=>[await replica(mac.page),await replica(phone.page)],{timeout:20000}).toEqual([target,target])
 console.log('PASS production: both durable device replicas match the canonical server data')
 await mac.page.screenshot({path:'/tmp/itemstracker-production-settings.png'})
 await phone.page.screenshot({path:'/tmp/itemstracker-production-phone.png'})

 if(expectedNetworkErrors.length)console.log('Expected WebKit errors from deliberate network aborts:',expectedNetworkErrors.length)
 await mac.context.close();await phone.context.close()
}catch(error){console.log('FAILED ASSERTION',error.message);if(debug){try{console.log('SYNC DIAGNOSTIC',JSON.stringify(await debug()))}catch{}}throw error}finally{await desktopBrowser?.close();await phoneBrowser?.close()}
