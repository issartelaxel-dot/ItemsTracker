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
 for(const [width,height] of [[320,568],[360,780],[375,667],[390,844],[430,932],[667,375],[767,600]]){
 const t=await setup(browser,width,height),{page,context}=t;const row={browser:name,width,height,checks:[],smallTargets:[]}
 const nav=page.locator('.mobile-bottom-nav');await expect(nav).toBeVisible();await expect(page.locator('.dashboard-sidebar')).toBeHidden();assert.equal(await nav.locator('button').count(),4)
 for(const b of await nav.locator('button').all()){const box=await b.boundingBox();assert.ok(box.width>=44&&box.height>=44)}
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
 await nav.getByRole('button',{name:'Accueil',exact:true}).click();await page.getByRole('button',{name:'Créer des flashcards',exact:false}).click();await expect(page.locator('.flash-create-modal')).toBeVisible();await check(page,'creator');await page.keyboard.press('Escape');await expect(page.locator('.flash-create-modal')).toHaveCount(0)
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
 }finally{await browser.close()}
}

} finally { server.kill('SIGTERM') }
