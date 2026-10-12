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


for(const [name,engine] of [['chrome',chromium],['webkit',webkit]]) {
 const browser=await engine.launch({headless:true,...(name==='chrome'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})})
 for(const width of [390,1440]) {
  const t=await setup(browser,width,844),{page,context}=t
  let rows=[],read=false
  await context.route('**/api/admin/announcements**',async route=>{
   const req=route.request(),url=new URL(req.url()).pathname
   if(req.method()==='POST'&&url.endsWith('/publish'))rows[0].status='published'
   else if(req.method()==='POST'){rows.push({...req.postDataJSON(),id:1,status:'draft'})}
   await route.fulfill({contentType:'application/json',body:JSON.stringify({announcements:rows,announcement:rows[0]})})
  })
  await context.route('**/api/announcements**',async route=>{
   if(route.request().method()==='POST')read=true
   await route.fulfill({contentType:'application/json',body:JSON.stringify({announcements:rows.filter(r=>r.status==='published').map(r=>({...r,read_at:read?'read':null,published_at:'2026-10-12T00:00:00Z'})),ok:true})})
  })
  await page.goto(base+'/itemstracker/admin-app.html')
  await expect(page.getByRole('heading',{name:'Nouvelle annonce',exact:true})).toBeVisible()
  await page.getByLabel('Titre',{exact:true}).fill('Éditeur amélioré')
  await page.getByLabel('Résumé dans la cloche',{exact:true}).fill('Une saisie plus fluide.')
  await page.getByLabel('Patchnotes détaillées',{exact:false}).fill('Gras et italique combinés.\n<script>alert(1)</script>')
  await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click()
  await expect(page.getByText('Brouillon enregistré.',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Aperçu',exact:true}).click()
  await expect(page.locator('.ann-preview')).toContainText('<script>alert(1)</script>')
  assert.equal(await page.locator('.ann-preview script').count(),0)
  page.once('dialog',d=>d.accept())
  await page.getByRole('button',{name:'Publier',exact:true}).click()
  await expect(page.getByText('Annonce publiée dans la cloche.',{exact:true})).toBeVisible()
  rows.push({...rows[0],id:2,title:'Deuxième annonce'})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Admin overflow')
  await page.goto(base+'/itemstracker/app.html')
  await expect(page.locator('.dashboard-home')).toBeVisible()
  const bell=page.locator('.ann-bell').first()
  await expect(bell.locator('.ann-badge')).toHaveText('2')
  await bell.getByRole('button').first().click()
  await expect(page.locator('.ann-entry').first()).toContainText('Éditeur amélioré')
  assert.equal(read,false,'Opening the panel must not mark as read')
  const bounds=await page.locator('.ann-panel').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width,'Notification panel overflow')
  await page.screenshot({path:'/tmp/announcements-'+name+'-'+width+'.png'})
  await page.locator('.ann-entry').first().click()
  await expect(bell.locator('.ann-badge')).toHaveText('1')
  await expect(page.locator('.ann-details')).toContainText('<script>alert(1)</script>')
  await page.getByRole('button',{name:'← Retour',exact:true}).click()
  await page.getByRole('button',{name:'Tout marquer comme lu',exact:true}).click()
  await expect(bell.locator('.ann-badge')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator('.ann-panel')).toHaveCount(0)
  assert.equal(await page.locator('a[href*="admin-app"]').count(),0,'No admin navigation link')
  assert.deepEqual(t.errors,[])
  console.log(name+' '+width+' admin draft / preview / publication / bell / reads / safe text PASS')
  await context.close()
 }
 await browser.close()
}
} finally { server.kill('SIGTERM') }
