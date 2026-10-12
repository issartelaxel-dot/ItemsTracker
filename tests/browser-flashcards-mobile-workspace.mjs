// Flashcards catalog regression tests. All API and provider calls are mocked; no real account is modified.
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

const base = `http://127.0.0.1:${port}`, out = process.env.FLASHCARDS_QA_OUTPUT || path.join(os.tmpdir(), 'itemstracker-flashcards-qa')
fs.mkdirSync(out + '/captures', { recursive: true })
async function setup(browser,width=390,height=844,fixture={}){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:width<768,hasTouch:width<768})
 const page=await context.newPage(),errors=[],saves=[];page.on('pageerror',e=>errors.push(e.message))
 let state={trackingState:{items:{1:{assignedColleges:['MÉDECINE INTERNE'],youtubeUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',usefulLinkUrl:'https://example.com/article',quiz:{enabled:true,activeCardId:'test-card-1',cards:[1,2,3].map(i=>({id:'test-card-'+i,question:'<p>Question '+i+' : Comment conserver une révision lisible sur un téléphone ?</p>',answer:'<p>Réponse '+i+' : Le contenu reste accessible, avec des boutons tactiles et une navigation claire.</p>',quizCount:0,lastReviewedAt:null,lastResult:null}))}}}},theme:'light',focusMode:false,dateFormat:'fr-short',timeZone:'auto',youtubeDisplayMode:'embed',shuffleQuizCards:false,profile:{firstName:'Test',lastName:'Local',email:'test@example.test',photoUrl:'',password:'',avatarGradient:'red'}},version=1
 state={...state,...fixture}
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


const colleges=['ANATOMIE ET CYTOLOGIE PATHOLOGIQUES','ANESTHÉSIE - RÉANIMATION','CANCÉROLOGIE','MÉDECINE INTERNE']
const outcomes=[['good','easy'],['good','hard'],[null,null],['hard','medium']]
const fixture={trackingState:{items:Object.fromEntries(colleges.map((college,i)=>[String(i+1),{assignedColleges:[college],quiz:{enabled:true,activeCardId:`card-${i}-0`,cards:outcomes[i].map((lastResult,j)=>({id:`card-${i}-${j}`,question:`<p>Question ${i+1}-${j+1}</p>`,answer:'<p>Réponse complète de test.</p>',quizCount:lastResult?1:0,lastReviewedAt:lastResult?'2026-10-01T12:00:00Z':null,lastResult}))}}]))}}

const results=[]
for(const [name,engine] of [['chrome',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chrome'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})})
 try {for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[767,1024]]){
  const t=await setup(browser,width,height,fixture),{page}=t
  await page.locator('.mobile-bottom-nav').getByRole('button',{name:'Flashcards',exact:true}).click()
  const workspace=page.locator('.flashcards-workspace'),sheet=page.getByRole('dialog',{name:'Filtres des flashcards',exact:true})
  await expect(workspace.locator('h1')).toHaveText('Flashcards');await page.waitForTimeout(250)
  assert.ok((await dimensions(page)).scrollWidth<=width+1)
  const targets=await workspace.locator('button:visible,select:visible').evaluateAll(els=>els.filter(e=>!e.disabled).filter(e=>e.getBoundingClientRect().height<43.5).map(e=>e.textContent))
  assert.deepEqual(targets,[])
  await page.screenshot({path:out+'/captures/'+name+'-'+width+'.png'})
  await expect(workspace.locator('.flash-status-group')).toHaveCount(5)
  for(const [status,count] of [['none',2],['hard',2],['medium',1],['good',2],['easy',1]])await expect(workspace.locator('.flash-feeling-'+status+' .flash-status-count')).toContainText(String(count))
  await expect(workspace.locator('.flash-status-card')).toHaveCount(0)
  await workspace.getByRole('group',{name:'Organisation des flashcards'}).getByRole('button',{name:'Collège',exact:true}).click()
  const all=await workspace.locator('.flashcards-college-card').count()
  const gallery=await workspace.locator('.flashcards-college-card').evaluateAll(els=>els.slice(0,2).map(e=>e.getBoundingClientRect().toJSON()));assert.ok(Math.abs(gallery[0].y-gallery[1].y)<1 && gallery[1].x>gallery[0].x+gallery[0].width,'Gallery uses two columns')
  assert.equal(await workspace.locator('.flashcards-college-grid').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true)
  await page.screenshot({path:out+'/captures/'+name+'-'+width+'-gallery.png'})
  await workspace.getByRole('button',{name:'Filtres',exact:true}).click();await expect(sheet).toBeVisible()
  const colors=await sheet.locator('.flash-workspace-status button i').evaluateAll(els=>els.map(e=>getComputedStyle(e).backgroundColor));assert.equal(new Set(colors).size,4)
  assert.equal(await sheet.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true)
  await sheet.locator('.flash-status-mastered').click()
  const closeRect=await sheet.getByRole('button',{name:'Fermer les filtres'}).boundingBox();assert.ok(closeRect.y>=0 && closeRect.y+closeRect.height<=height)
  await expect(workspace.locator('.flashcards-college-card')).toHaveCount(1)
  await page.screenshot({path:out+'/captures/'+name+'-'+width+'-filters.png'})
  await sheet.getByRole('button',{name:'Afficher les résultats'}).click();await expect(sheet).toBeHidden()
  await expect(workspace.locator('.flashcards-card-progress strong')).toHaveText('100%')
  await expect(workspace.getByRole('button',{name:'Filtres',exact:true})).toBeFocused()
  await workspace.getByRole('button',{name:'Filtres',exact:true}).click()
  await sheet.getByRole('button',{name:'Réinitialiser les filtres'}).click()
  await sheet.getByRole('combobox',{name:'Tri des flashcards',exact:true}).selectOption('name')
  await sheet.getByRole('combobox',{name:'Niveau des flashcards',exact:true}).selectOption('easy')
  await sheet.getByRole('button',{name:'Afficher les résultats'}).click()
  await expect(workspace.getByRole('combobox',{name:'Filtrer les flashcards par niveau'})).toHaveValue('easy')
  await expect(workspace.locator('.flashcards-college-card')).toHaveCount(1)
  await workspace.getByRole('combobox',{name:'Filtrer les flashcards par niveau'}).selectOption('ALL')
  await expect(workspace.locator('.flashcards-college-card')).toHaveCount(all)
  const search=workspace.getByRole('searchbox',{name:'Rechercher une thématique ou un item',exact:true})
  await search.fill('anesthesie');await expect(workspace.locator('.flashcards-college-card')).toHaveCount(1)
  await search.fill('aucun-resultat-xyz');await expect(workspace.locator('.flashcards-empty-state')).toBeVisible();await search.fill('')
  await workspace.getByRole('group',{name:'Présentation des flashcards'}).getByRole('button',{name:'Ligne',exact:true}).click();await expect(workspace).toHaveClass(/flash-layout-list/)
  const list=await workspace.locator('.flashcards-college-card').evaluateAll(els=>els.slice(0,2).map(e=>e.getBoundingClientRect().toJSON()));assert.ok(list[1].y>=list[0].y+list[0].height && Math.abs(list[0].x-list[1].x)<1,'List uses one column')
  await page.screenshot({path:out+'/captures/'+name+'-'+width+'-list.png'})
  await workspace.getByRole('group',{name:'Organisation des flashcards'}).getByRole('button',{name:'Item',exact:true}).click();await expect(workspace.locator('.flashcards-item-card')).toHaveCount(4)
  await workspace.getByRole('group',{name:'Présentation des flashcards'}).getByRole('button',{name:'Galerie',exact:true}).click()
  await workspace.locator('.flashcards-card-view').first().click();await expect(page.locator('.flashcards-list-modal')).toBeVisible()
  await page.locator('.flashcards-list-modal').getByRole('button',{name:'Fermer la liste des cartes',exact:true}).click()
  await workspace.locator('.flashcards-card-menu').first().click();await expect(page.locator('.flash-generator-modal')).toBeVisible();await page.locator('.flash-generator-modal').getByRole('button',{name:'Fermer',exact:true}).click()
  await workspace.getByRole('button',{name:'Créer',exact:true}).click();await expect(page.locator('.flash-create-modal')).toBeVisible();await page.locator('.flash-create-modal').getByRole('button',{name:'Fermer',exact:true}).click()
  await workspace.getByRole('button',{name:'Réviser',exact:true}).click();await expect(page.getByRole('dialog',{name:'Révision',exact:true})).toBeVisible();await page.getByRole('dialog',{name:'Révision',exact:true}).getByRole('button',{name:'Quitter',exact:true}).click()
  await workspace.getByRole('button',{name:'Filtres',exact:true}).click();await page.keyboard.press('Escape');await expect(sheet).toBeHidden()
  assert.equal(t.saves.length,0);assert.deepEqual(t.errors,[])
  // Theme and desktop breakpoint remain usable; an open sheet releases its scroll lock.
  await workspace.getByRole('button',{name:'Filtres',exact:true}).click()
  await page.setViewportSize({width:1440,height:1000});await expect(page.locator('.flash-mobile-sheet')).toHaveCount(0)
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'')
  await page.getByRole('button',{name:'Activer le thème sombre',exact:true}).click()
  await page.setViewportSize({width,height});await expect(sheet).toBeVisible();await sheet.getByRole('button',{name:'Fermer les filtres'}).click()
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:out+'/captures/'+name+'-'+width+'-dark.png'})
  assert.ok((await dimensions(page)).scrollWidth<=width+1);assert.deepEqual(t.errors,[])
  results.push({browser:name,width,height,pass:true});console.log(name,width,'PASS');await t.context.close()
 }}finally{await browser.close()}
}
fs.writeFileSync(out+'/validation-mobile-workspace.json',JSON.stringify(results,null,2))
}finally{server.kill('SIGTERM')}
