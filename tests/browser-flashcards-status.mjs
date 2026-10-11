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



const fixture={trackingState:{items:{1:{assignedColleges:['MÉDECINE INTERNE'],quiz:{enabled:true,activeCardId:'many-1',cards:Array.from({length:25},(_,i)=>({id:'many-'+(i+1),question:`<p>Question groupe ${i+1}</p>`,answer:'<p>Réponse.</p>',lastResult:null,quizCount:0,lastReviewedAt:null}))}},2:{assignedColleges:['CANCÉROLOGIE'],quiz:{enabled:true,activeCardId:'other',cards:[{id:'other',question:'<p>Autre statut</p>',answer:'<p>Réponse.</p>',lastResult:'good',quizCount:1,lastReviewedAt:null}]}}}}}
for(const [name,engine] of [['chrome',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chrome'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})})
 try {for(const [width,height] of [[320,568],[390,844],[820,1180],[1440,1000]]){
 const t=await setup(browser,width,height,fixture),{page}=t
 await page.locator(width<768?'.mobile-bottom-nav':'.sidebar-nav').getByRole('button',{name:'Flashcards',exact:true}).click()
 await expect(page.locator('.flash-status-group')).toHaveCount(5);await expect(page.locator('.flash-status-card')).toHaveCount(0)
 await expect(page.locator('.flash-feeling-none .flash-status-count')).toHaveText('25 cartes')
 await expect(page.locator('.flash-feeling-hard .flash-status-review')).toBeDisabled()
 assert.ok((await dimensions(page)).scrollWidth<=width+1)
 await page.screenshot({path:out+'/captures/'+name+'-'+width+'-groups.png'})
 await page.getByRole('button',{name:'Réviser le groupe Non évalué',exact:true}).click()
 const review=page.getByRole('dialog',{name:'Révision',exact:true});await expect(review).toBeVisible()
 await review.getByRole('button',{name:'Commencer',exact:true}).click();await expect(page.locator('.quiz-study-card-body')).toContainText('Question groupe 1')
 await expect(review).toContainText('1 / 25');await expect(review).not.toContainText('Autre statut');console.log(name,width,'All 25 group cards, no previews, no other status PASS')
 await review.getByRole('button',{name:'Quitter',exact:true}).click();assert.deepEqual(t.errors,[]);await t.context.close()
 }}finally{await browser.close()}
}
}finally{server.kill('SIGTERM')}
