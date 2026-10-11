// Desktop/tablet dashboard regression tests. All API and provider calls are mocked; no real account is modified.
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

const base = `http://127.0.0.1:${port}`, out = process.env.DASHBOARD_QA_OUTPUT || path.join(os.tmpdir(), 'itemstracker-dashboard-qa')
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

const results=[]
for (const [name,engine] of [['chrome',chromium],['webkit',webkit]]) {
 const browser=await engine.launch({headless:true,...(name==='chrome'&&process.platform==='darwin'?{executablePath:process.env.TEST_BROWSER_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})})
 try {
  for (const [width,height] of [[1920,1080],[1440,900],[1280,800],[1024,768],[820,1180],[768,1024]]) {
   const t=await setup(browser,width,height),{page}=t
   const dashboard=page.locator('.desktop-dashboard')
   await expect(dashboard).toBeVisible();await expect(page.locator('.mobile-dashboard')).toHaveCount(0)
   await expect(page.locator('.dashboard-sidebar')).toBeVisible();await expect(page.locator('.mobile-bottom-nav')).toBeHidden()
   await expect(dashboard.getByRole('progressbar',{name:'Progression globale'})).toHaveAttribute('aria-valuenow','0')
   await expect(dashboard.locator('.mobile-dash-due strong')).toHaveText('1')
   const geometry=await dashboard.evaluate(el=>{
    const r=s=>el.querySelector(s).getBoundingClientRect().toJSON()
    return {root:el.getBoundingClientRect().toJSON(),hero:r('.mobile-dash-hero'),journey:r('.mobile-dash-journey'),shortcuts:r('.mobile-dash-shortcuts'),activity:r('.mobile-dash-activity'),colleges:r('.mobile-dash-colleges'),item:r('.mobile-dash-items'),flash:r('.mobile-dash-flashcards')}
   })
   assert.ok(Math.abs(geometry.hero.width-geometry.root.width)<2,'Hero spans the content width')
   assert.ok(Math.abs(geometry.item.y-geometry.flash.y)<1,'Shortcut buttons share a row')
   assert.ok(geometry.item.x+geometry.item.width<=geometry.flash.x,'Shortcut buttons do not overlap')
   if(geometry.root.width>780){assert.ok(Math.abs(geometry.journey.y-geometry.shortcuts.y)<1);assert.ok(geometry.journey.x+geometry.journey.width<=geometry.shortcuts.x)}
   else assert.ok(geometry.shortcuts.y>=geometry.journey.y+geometry.journey.height,'Narrow tablets stack panels')
   const d=await dimensions(page);assert.ok(d.scrollWidth<=width+1,'No horizontal overflow');assert.deepEqual(d.overflow,[])
   const calendar=dashboard.locator('.mobile-dash-calendar'),grid=calendar.locator('.habit-tracker-wrap')
   assert.equal(await grid.locator('.habit-week').count(),53);assert.equal(await grid.locator('.habit-dot:not(.out-range)').count(),365)
   const first=await grid.locator('.habit-week').first().boundingBox(),last=await grid.locator('.habit-week').last().boundingBox()
   assert.ok(Math.abs(first.y-last.y)<1,'All weeks stay on one row');assert.ok((await grid.boundingBox()).height<=114)
   await calendar.locator('summary').click();await expect(grid).toBeHidden();await calendar.locator('summary').click();await expect(grid).toBeVisible()
   await page.locator('.dashboard-content').evaluate(el=>el.scrollTop=0)
   await page.screenshot({path:out+'/captures/'+name+'-'+width+'.png'})
   await page.locator('.mobile-dash-colleges').scrollIntoViewIfNeeded();await expect(page.locator('.mobile-dash-college-row')).toBeInViewport()
   await page.getByRole('button',{name:'Replier le menu',exact:true}).click();await page.waitForTimeout(300)
   await expect(page.getByRole('button',{name:'Etendre le menu',exact:true})).toBeVisible()
   assert.ok((await dimensions(page)).scrollWidth<=width+1)
   if(width===1440){await page.locator('.dashboard-content').evaluate(el=>el.scrollTop=0);await page.screenshot({path:out+'/captures/'+name+'-1440-collapsed.png'})}
   await page.getByRole('button',{name:'Etendre le menu',exact:true}).click();await page.waitForTimeout(300)
   if(width===1440){
    await dashboard.getByRole('button',{name:'Réviser mes items',exact:false}).click();await expect(page.locator('.items-list-row').first()).toBeVisible()
    await page.locator('.sidebar-nav').getByRole('button',{name:'Dashboard',exact:true}).click()
    await dashboard.getByRole('button',{name:'Créer des flashcards',exact:false}).click();await expect(page.locator('.flash-create-modal')).toBeVisible();await page.locator('.flash-create-modal').getByRole('button',{name:'Fermer',exact:true}).click();await expect(page.locator('.flash-create-modal')).toHaveCount(0)
    await page.locator('.sidebar-nav').getByRole('button',{name:'Dashboard',exact:true}).click()
    await dashboard.getByRole('button',{name:'Lancer une révision',exact:false}).click();await expect(page.getByRole('dialog',{name:'Révision',exact:true})).toBeVisible();await page.getByRole('dialog',{name:'Révision',exact:true}).getByRole('button',{name:'Quitter',exact:true}).click();await expect(page.locator('.quiz-modal')).toHaveCount(0)
    await dashboard.locator('.mobile-dash-college-row').click();await expect(page.getByRole('button',{name:'Retour aux collèges',exact:true})).toBeVisible()
    await page.locator('.sidebar-nav').getByRole('button',{name:'Dashboard',exact:true}).click()
    await dashboard.getByRole('button',{name:'Voir tout',exact:false}).click();await expect(page.locator('.colleges-page')).toBeVisible()
    await page.locator('.sidebar-nav').getByRole('button',{name:'Dashboard',exact:true}).click()
    await page.getByRole('searchbox',{name:'Recherche globale',exact:true}).fill('patient');await expect(page.locator('.global-search-result.result-item').first()).toBeVisible()
    await page.locator('.global-search-result.result-item').first().click();await expect(page.locator('.detail-panel.is-open')).toBeVisible()
    await page.locator('.sidebar-nav').getByRole('button',{name:'Dashboard',exact:true}).click()
   }
   // Theme rendering without touching a real account: all persistence remains mocked.
   await page.getByRole('button',{name:'Activer le thème sombre',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
   assert.equal(await dashboard.evaluate(el=>getComputedStyle(el).getPropertyValue('--mobile-dash-line').trim()),'#284770')
   assert.ok((await dimensions(page)).scrollWidth<=width+1)
   if(width===1440||width===768)await page.screenshot({path:out+'/captures/'+name+'-'+width+'-dark.png'})
   assert.deepEqual(t.errors,[]);results.push({browser:name,width,height,geometry,pass:true});console.log(name,width,'PASS');await t.context.close()
  }
  const completedItems=Object.fromEntries(Array.from({length:154},(_,i)=>[String(i+1),{assignedColleges:['MÉDECINE INTERNE'],noLisaSheets:true,noPlatformSheets:true,itemMastery:'Parfait',byCollege:{'MÉDECINE INTERNE':{reviews:1,mastery:'Parfait',lastReviewedAt:'2026-01-15T12:00:00.000Z',reviewHistory:[{date:'2026-01-15T12:00:00.000Z',delta:1}]}}}]))
  const actual=await setup(browser,1440,900,{trackingState:{items:completedItems}})
  await expect(actual.page.getByRole('progressbar',{name:'Progression globale'})).toHaveAttribute('aria-valuenow','42')
  await expect(actual.page.locator('.mobile-dash-college-percent')).toHaveText('100%');await expect(actual.page.locator('.mobile-dash-due strong')).toHaveText('0')
  assert.ok(await actual.page.locator('.mobile-dash-calendar .intensity-4').count()>0)
  await actual.page.setViewportSize({width:390,height:844});await expect(actual.page.locator('.mobile-dashboard')).toBeVisible();await expect(actual.page.locator('.desktop-dashboard')).toHaveCount(0)
  await expect(actual.page.getByRole('progressbar',{name:'Progression globale'})).toHaveAttribute('aria-valuenow','42')
  await actual.page.setViewportSize({width:1024,height:768});await expect(actual.page.locator('.desktop-dashboard')).toBeVisible()
  assert.deepEqual(actual.errors,[]);await actual.context.close()
  const empty=await setup(browser,1440,900,{trackingState:{items:{}},profile:{firstName:'Rene',lastName:'Test',email:'test@example.test'}})
  await expect(empty.page.getByRole('button',{name:'Lancer une révision',exact:false})).toBeDisabled();await expect(empty.page.locator('.mobile-dash-empty')).toBeVisible()
  await empty.page.getByRole('button',{name:'Replier le menu',exact:true}).click();await empty.page.waitForTimeout(400)
  await empty.page.screenshot({path:out+'/captures/'+name+'-reference-empty.png'});assert.deepEqual(empty.errors,[]);await empty.context.close()
 } finally {await browser.close()}
}
fs.writeFileSync(out+'/validation-desktop-tablette.json',JSON.stringify(results,null,2))
} finally {server.kill('SIGTERM')}
