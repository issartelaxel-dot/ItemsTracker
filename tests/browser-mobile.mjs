// Phone UI regression tests. All API and provider calls are mocked; no real account is modified.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import { spawn } from 'node:child_process'
const socket = net.createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
import { chromium, webkit, expect } from '@playwright/test'
import { mergePatch } from '../server/state-model.mjs'

const base = `http://127.0.0.1:${port}`, out = process.env.MOBILE_QA_OUTPUT || path.join(os.tmpdir(), 'itemstracker-mobile-qa')
fs.mkdirSync(out + '/captures', { recursive: true })
async function setup(browser,width=390,height=844){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:width<768,hasTouch:width<768})
 const page=await context.newPage(),errors=[],saves=[];page.on('pageerror',e=>errors.push(e.message))
 let state={trackingState:{items:{1:{assignedColleges:['Médecine Interne'],youtubeUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',usefulLinkUrl:'https://example.com/article',quiz:{enabled:true,activeCardId:'test-card-1',cards:[1,2,3].map(i=>({id:'test-card-'+i,question:'<p>Question '+i+' : Comment conserver une révision lisible sur un téléphone ?</p>',answer:'<p>Réponse '+i+' : Le contenu reste accessible, avec des boutons tactiles et une navigation claire.</p>',quizCount:0,lastReviewedAt:null,lastResult:null}))}}}},theme:'light',focusMode:false,dateFormat:'fr-short',timeZone:'auto',youtubeDisplayMode:'embed',shuffleQuizCards:false,profile:{firstName:'Test',lastName:'Local',email:'test@example.test',photoUrl:'',password:'',avatarGradient:'red'}},version=1
 await context.route('**/api/**',async route=>{
 const req=route.request(),p=new URL(req.url()).pathname
 const headers={'content-type':'application/json','x-app-version':'0.1.0','access-control-allow-origin':base,'access-control-allow-credentials':'true','access-control-expose-headers':'x-app-version','access-control-allow-headers':'content-type,authorization,x-client-version','access-control-allow-methods':'GET,PUT,PATCH,POST'}
 const answer=body=>route.fulfill({headers,body:JSON.stringify(body)})
 if(req.method()==='OPTIONS')return route.fulfill({status:204,headers})
 if(p==='/api/auth/me')return answer({user:{id:123,email:'test@example.test',displayName:'Test Local'},token:'test-token'})
 if(p==='/api/state'&&req.method()==='GET')return answer({state:{...state,updatedAt:new Date().toISOString()},version,imageVersions:{}})
 if(p==='/api/state'&&['PATCH','PUT'].includes(req.method())){const b=req.postDataJSON();saves.push(b);state=req.method()==='PATCH'?mergePatch(state,b.patch):b;return answer({ok:true,version:++version,updatedAt:new Date().toISOString()})}
 if(p==='/api/quiz/generate-mcq')return answer({distractors:[{text:'Proposition A'},{text:'Proposition B'},{text:'Proposition C'}],explanation:'Correction de test.'})
 if(p==='/api/resources/preview')return answer({preview:null})
 return answer({ok:true,token:'test-token',version})
 })
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'||route.request().url().includes('/api/')?route.fallback():route.abort())
 await page.goto(base+'/itemstracker/app.html');await expect(page.locator('.dashboard-home')).toBeVisible({timeout:20000});await page.waitForTimeout(400)
 return {context,page,errors,saves,getState:()=>state}
}
async function dimensions(page){return page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&s.display!=='none'&&(r.right>innerWidth+1||r.left < -1)}).slice(0,12).map(el=>({class:el.className,text:el.textContent.slice(0,60),rect:el.getBoundingClientRect().toJSON()}))}))}

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(base + '/itemstracker/app.html')).ok) break } catch {}
    await new Promise(resolve => setTimeout(resolve, 50))
  }
const results=[]
async function check(page,label){await page.waitForTimeout(120);const d=await dimensions(page);assert.ok(d.scrollWidth<=d.width+1,label+' body overflow '+JSON.stringify(d));return d}
async function targets(page){return page.locator('button:visible,input:visible,select:visible,a.ghost-btn:visible').evaluateAll(els=>els.filter(e=>!e.disabled&&!e.matches('[type=checkbox],[type=radio]')).map(e=>({text:e.getAttribute('aria-label')||e.textContent.trim().slice(0,35),class:e.className,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})).filter(e=>e.h<43.5||e.w<43.5))}
for(const [name,engine] of [['chrome',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name === 'chrome' && process.platform === 'darwin' ? { executablePath: process.env.TEST_BROWSER_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {})})
 try{
 for(const [width,height] of [[390,844],[320,568],[360,780],[375,667],[430,932],[667,375],[767,600]]){
 const t=await setup(browser,width,height),{page,context}=t;const row={browser:name,width,height,checks:[],smallTargets:[]}
 const nav=page.locator('.mobile-bottom-nav');await expect(nav).toBeVisible();await expect(page.locator('.dashboard-sidebar')).toBeHidden();assert.equal(await nav.locator('button').count(),5)
 for(const b of await nav.locator('button').all()){const box=await b.boundingBox();assert.ok(box.width>=44&&box.height>=44)}

 // Floating pill: native taps, drag navigation, cancellation and motion preferences.
 const indicator=nav.locator('.mobile-bottom-nav-indicator')
 await expect(indicator).toHaveCount(1)
 assert.equal(await nav.evaluate(el=>getComputedStyle(el).borderRadius),'999px')
 await nav.getByRole('button',{name:'Items',exact:true}).tap()
 await expect(page.locator('.items-list-row')).toHaveCount(367)
 await expect(nav.getByRole('button',{name:'Items',exact:true})).toHaveAttribute('aria-current','page')
 await page.waitForTimeout(420)
 const activeBox=await nav.getByRole('button',{name:'Items',exact:true}).boundingBox(),pillBox=await indicator.boundingBox()
 assert.ok(Math.abs(activeBox.x-pillBox.x)<1 && Math.abs(activeBox.width-pillBox.width)<1,'Indicator aligns with active tab')
 await nav.getByRole('button',{name:'Flashcards',exact:true}).tap()
 await expect(page.locator('.flashcards-page')).toBeVisible();await page.waitForTimeout(420)
 const flashBox=await nav.getByRole('button',{name:'Flashcards',exact:true}).boundingBox()
 assert.ok(Math.abs((await indicator.boundingBox()).x-flashBox.x)<0.75,'Indicator aligns precisely on third tab')
 await nav.getByRole('button',{name:'Collèges',exact:true}).tap()
 await expect(page.locator('.colleges-page')).toBeVisible();await page.waitForTimeout(420)
 const collegeBox=await nav.getByRole('button',{name:'Collèges',exact:true}).boundingBox()
 assert.ok(Math.abs((await indicator.boundingBox()).x-collegeBox.x)<0.75,'Indicator aligns on Collèges')
 await nav.getByRole('button',{name:'Dashboard',exact:true}).tap()
 assert.equal(await nav.getByRole('button',{name:'Dashboard',exact:true}).locator('svg rect').count(),4)
 for(const label of await nav.locator('button span').all())assert.ok(await label.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Footer labels must fit')
 if(width===390){
   const drag=async(from,to,cancel=false)=>{
     const buttons=nav.locator('button'),a=await buttons.nth(from).boundingBox(),b=await buttons.nth(to).boundingBox()
     await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down()
     await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8})
     await expect(nav).toHaveClass(/is-dragging/)
     const moving=await indicator.boundingBox();assert.ok(Math.abs(moving.x-b.x)<2,'Pill follows gesture')
     if(cancel)await nav.dispatchEvent('pointercancel',{pointerId:1})
     await page.mouse.up()
   }
   await drag(0,2);await expect(page.locator('.flashcards-page')).toBeVisible()
   await page.waitForTimeout(60);await expect(nav.getByRole('button',{name:'Flashcards',exact:true})).toHaveAttribute('aria-current','page')
   await drag(2,0);await expect(page.locator('.dashboard-home')).toBeVisible()
   await drag(0,2,true);await expect(page.locator('.dashboard-home')).toBeVisible()
   await drag(0,3);await expect(page.locator('.colleges-page')).toBeVisible()
   await expect(nav.getByRole('button',{name:'Collèges',exact:true})).toHaveAttribute('aria-current','page')
   await drag(3,4);await expect(page.getByRole('dialog',{name:'Plus',exact:true})).toBeVisible();await page.keyboard.press('Escape')
   await nav.getByRole('button',{name:'Dashboard',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('.dashboard-home')).toBeVisible()
   if(name==='chrome'){
     const cdp=await context.newCDPSession(page),a=await nav.locator('button').nth(0).boundingBox(),b=await nav.locator('button').nth(1).boundingBox(),y=a.y+a.height/2
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y}]})
     for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+a.width/2+(b.x-a.x)*i/8,y}]})
     await expect(nav).toHaveClass(/is-dragging/)
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
     await expect(page.locator('.items-list-row')).toHaveCount(367)
     await nav.getByRole('button',{name:'Dashboard',exact:true}).tap();await cdp.detach()
   }
   await page.emulateMedia({reducedMotion:'reduce'})
   assert.equal(await indicator.evaluate(el=>getComputedStyle(el).transitionDuration),'0s')
   await page.emulateMedia({reducedMotion:'no-preference'})
   await page.waitForTimeout(420);await page.screenshot({path:out+'/captures/'+name+'-footer-light.png'})
   await nav.screenshot({path:out+'/captures/'+name+'-footer-detail.png'})
   row.checks.push('footer pill / tap / drag / cancel / keyboard / reduced motion')
 }
 const streak=await page.locator('.dashboard-streak-card').boundingBox(),due=await page.locator('.dashboard-stat-card').nth(2).boundingBox();assert.ok(Math.abs(streak.y-due.y)<1,'Stats must share row')
 await check(page,'dashboard');row.checks.push('dashboard / barre / 2 colonnes');row.smallTargets.push(...await targets(page))
 await nav.getByRole('button',{name:'Plus',exact:true}).click();const sheet=page.getByRole('dialog',{name:'Plus',exact:true});await expect(sheet).toBeVisible();await page.waitForTimeout(250)
 await expect(sheet.getByRole('button',{name:'Insights',exact:false})).toBeDisabled();await expect(sheet.getByRole('button',{name:'Déconnexion',exact:true})).toBeVisible()
 await sheet.getByRole('button',{name:'Activer le thème sombre'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await sheet.getByRole('button',{name:'Activer le thème clair'}).click()
 await sheet.getByRole('button',{name:'Déconnexion',exact:true}).focus();await page.keyboard.press('Tab');assert.ok(await sheet.evaluate(e=>e.contains(document.activeElement)))
 await page.keyboard.press('Escape');await expect(sheet).toHaveCount(0);assert.ok(await nav.evaluate(e=>e.contains(document.activeElement)))
 await nav.getByRole('button',{name:'Items',exact:true}).click();await expect(page.locator('.items-list-row')).toHaveCount(367);await check(page,'items');row.smallTargets.push(...await targets(page))
 const search=page.getByRole('textbox',{name:'Rechercher un item',exact:true});assert.ok(parseFloat(await search.evaluate(e=>getComputedStyle(e).fontSize))>=16)
 await search.fill('valeurs professionnelles');await expect(page.locator('.items-list-row')).toHaveCount(1)
 await page.getByRole('button',{name:'Ouvrir les filtres des items'}).click();const filters=page.getByRole('dialog',{name:'Filtres',exact:true});await expect(filters).toBeVisible();await page.waitForTimeout(220)
 await filters.getByRole('combobox',{name:'Trier les items'}).selectOption('itemDesc');await filters.getByRole('button',{name:'Réinitialiser'}).click();await expect(search).toHaveValue('');await expect(page.locator('.items-list-row')).toHaveCount(367)
 const college=filters.getByRole('combobox',{name:'Filtrer par collège'});const opts=await college.locator('option').allTextContents();assert.ok(opts.length>2)
 await college.selectOption({label:opts[1]});await filters.getByRole('combobox',{name:'Filtrer par ressenti'}).selectOption('Moyen');await filters.getByRole('button',{name:'Voir les',exact:false}).click();assert.ok(await page.locator('.items-list-row').count()<367)
 await page.getByRole('button',{name:'Ouvrir les filtres des items'}).click();await expect(college).not.toHaveValue('ALL');await filters.getByRole('button',{name:'Réinitialiser'}).click();await page.keyboard.press('Escape')
 await page.getByRole('button',{name:'Ouvrir les filtres des items'}).click();await page.goBack();await expect(filters).toHaveCount(0);await expect(page.locator('.items-list-row')).toHaveCount(367)
 row.checks.push('recherche / tous filtres / tri / reset / retour navigateur / focus')
 await page.locator('.items-list-row').first().click();await expect(page.locator('.detail-panel.is-open')).toBeVisible();await page.waitForTimeout(500);await check(page,'item detail')
 await page.getByRole('button',{name:'Ressources',exact:true}).click();await page.getByRole('button',{name:'Vidéo YouTube',exact:false}).click();await expect(page.locator('iframe[src*="youtube"]')).toBeAttached();await page.getByRole('button',{name:'Flashcards',exact:true}).filter({has:page.locator(':scope')}).count().catch(()=>{})
 await page.locator('.item-detail-tabs').getByRole('button',{name:'Flashcards',exact:true}).click();await check(page,'detail flashcards');await page.goBack();await expect(page.locator('.items-list-row')).toHaveCount(367)
 row.checks.push('fiche / onglets / ressources YouTube / retour')
 await nav.getByRole('button',{name:'Flashcards',exact:true}).click();await expect(page.locator('.flashcards-page')).toBeVisible();await check(page,'flashcards');row.smallTargets.push(...await targets(page))
 await page.evaluate(()=>scrollTo(0,600));await nav.getByRole('button',{name:'Plus',exact:true}).click();assert.equal(await page.evaluate(()=>scrollY),600);await sheet.getByRole('button',{name:'Collèges',exact:true}).click();await expect(page.locator('.colleges-page')).toBeVisible();await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);await check(page,'colleges');row.smallTargets.push(...await targets(page));await page.goBack();await expect(page.locator('.flashcards-page')).toBeVisible();await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(600)
 await nav.getByRole('button',{name:'Plus',exact:true}).click();await sheet.getByRole('button',{name:'Paramètres',exact:true}).click();await expect(page.locator('.settings-page')).toBeVisible();await check(page,'settings');row.smallTargets.push(...await targets(page))
 await nav.getByRole('button',{name:'Dashboard',exact:true}).click();await page.getByRole('button',{name:'Créer des flashcards',exact:false}).click();await expect(page.locator('.flash-create-modal')).toBeVisible();await check(page,'creator');await page.keyboard.press('Escape');await expect(page.locator('.flash-create-modal')).toHaveCount(0)
 row.checks.push('Flashcards / Collèges / paramètres / création')
 await page.getByRole('button',{name:'Lancer une révision',exact:false}).click();const review=page.getByRole('dialog',{name:'Révision',exact:true});await expect(review).toBeVisible();await page.getByRole('button',{name:'Commencer',exact:true}).click();await page.waitForTimeout(500)
 await check(page,'revision question');const card=await page.locator('.quiz-study-card').boundingBox();assert.ok(card.height<=250,'Short card must stay compact: '+card.height)
 const reveal=page.getByRole('button',{name:'Afficher la réponse',exact:true}),next=review.getByRole('button',{name:'Suivante',exact:true});const n=await next.boundingBox(),r=await reveal.boundingBox();assert.ok(n.y+n.height<=r.y+1,'Review controls overlap')
 await next.click();await expect(page.locator('.quiz-study-card-body')).toContainText('Question 2');await review.getByRole('button',{name:'Précédente',exact:true}).click();await expect(page.locator('.quiz-study-card-body')).toContainText('Question 1')
 await reveal.click();await expect(page.locator('.quiz-study-card-body')).toContainText('Réponse 1');assert.equal(await review.locator('.quiz-rate-btn').count(),4);await check(page,'revision answer');assert.ok((await page.locator('.quiz-study-card').boundingBox()).height<=250,'Short answer must stay compact')
 for(const b of await review.locator('.quiz-rate-btn').all()){const bb=await b.boundingBox();assert.ok(bb.width>=44&&bb.height>=44)}
 await review.getByRole('button',{name:'Facile',exact:true}).click();await page.waitForTimeout(700);await expect(page.locator('.quiz-study-card-body')).toContainText('Question 2')
 await expect.poll(()=>t.getState().trackingState.items['1'].quiz.cards[0].lastResult,{timeout:10000}).toBe('good');await page.keyboard.press('Escape');await expect(review).toHaveCount(0);await expect(nav).toBeVisible()
 row.checks.push('révision compacte / précédent-suivant / réponse / 4 niveaux / sauvegarde / fermeture')
 if(width===390){await nav.getByRole('button',{name:'Plus',exact:true}).click();await page.waitForTimeout(250);await page.screenshot({path:out+'/captures/'+name+'-plus.png'});await page.keyboard.press('Escape')}
 assert.deepEqual(t.errors,[]);row.checks.push('aucune erreur JS');results.push(row);assert.deepEqual(row.smallTargets,[],'Small touch targets');console.log(name,width,'PASS');fs.writeFileSync(out+'/validation-mobile.json',JSON.stringify(results,null,2));await context.close()
 }
 const desktop=await setup(browser,1440,900)
 await expect(desktop.page.locator('.mobile-bottom-nav')).toBeHidden()
 await expect(desktop.page.locator('.dashboard-sidebar')).toBeVisible()
 assert.deepEqual(desktop.errors,[]);await desktop.context.close();console.log(name,'desktop navigation unchanged PASS')
 }finally{await browser.close()}
}

} finally { server.kill('SIGTERM') }
