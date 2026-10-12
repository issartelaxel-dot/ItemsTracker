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
 for(const width of [390,1024,1440]) {
  const t=await setup(browser,width,900),{page}=t
  await page.locator(width<768?'.mobile-bottom-nav':'.dashboard-sidebar').getByRole('button',{name:'Flashcards',exact:true}).click()
  const buttons=page.locator('.flash-workspace-organize button')
  const baseline=await buttons.evaluateAll(els=>els.map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})))
  for(const label of ['Collège','Item','Statut']) {
   await buttons.getByText(label,{exact:true}).click()
   await page.waitForTimeout(100)
   const dims=await buttons.evaluateAll(els=>els.map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})))
   assert.deepEqual(dims,baseline,'Organization button dimensions must stay stable')
  }
  if(width>=1024){
   await expect(page.locator('.flash-workspace-search-row')).toHaveCount(0)
   await expect(page.getByRole('combobox',{name:'Niveau des flashcards',exact:true})).toBeVisible()
   const group=await page.locator('.flash-status-groups').boundingBox(),controls=await page.locator('.flash-workspace-controls').boundingBox()
   assert.ok(group.y-controls.y-controls.height<30,'Status groups must immediately follow controls')
   await page.locator('.flash-workspace-filter-head button').click()
   await expect(page.locator('.flash-workspace-search-row')).toBeVisible()
   await page.locator('.flash-workspace-filter-head button').click()
  }
  assert.deepEqual(t.errors,[])
  console.log(name+' '+width+' stable controls / filters / spacing PASS')
  if(name==='chrome')await page.screenshot({path:'/tmp/flash-workspace-stable-'+width+'.png'})
  await t.context.close()
 }
 await browser.close()
}
} finally { server.kill('SIGTERM') }
