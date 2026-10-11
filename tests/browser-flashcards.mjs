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


const results=[]
const colleges=['ANATOMIE ET CYTOLOGIE PATHOLOGIQUES','ANESTHÉSIE - RÉANIMATION','CANCÉROLOGIE','MÉDECINE INTERNE']
const outcomes=[['good','easy'],['good','hard'],[null,null],['hard','medium']]
const fixture={trackingState:{items:Object.fromEntries(colleges.map((college,i)=>[String(i+1),{assignedColleges:[college],quiz:{enabled:true,activeCardId:`card-${i}-0`,cards:outcomes[i].map((lastResult,j)=>({id:`card-${i}-${j}`,question:`<p>Question ${i+1}-${j+1}</p>`,answer:'<p>Réponse complète de test.</p>',quizCount:lastResult?1:0,lastReviewedAt:lastResult?'2026-10-01T12:00:00Z':null,lastResult}))}}]))}}
for(const [name,engine] of [['chrome',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chrome'&&process.platform==='darwin'?{executablePath:process.env.TEST_BROWSER_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})})
 try{
  for(const [width,height] of [[1920,1080],[1440,1000],[1280,800],[1024,768],[820,1180],[768,1024]]){
   const t=await setup(browser,width,height,fixture),{page}=t
   await page.locator('.sidebar-nav').getByRole('button',{name:'Flashcards',exact:true}).click()
   const workspace=page.locator('.flashcards-workspace');await expect(workspace).toBeVisible()
   await expect(workspace.locator('h1')).toHaveText('Flashcards');await expect(workspace.locator('.flash-workspace-head p')).toContainText('1/4 items maîtrisés')
   const all=await workspace.locator('.flashcards-college-card').count();assert.ok(all>8,'All actual colleges remain visible')
   await page.waitForTimeout(250);const dims=await dimensions(page);assert.ok(dims.scrollWidth<=width+1,'No page overflow');assert.deepEqual(dims.overflow,[])
   const searchRect=await page.locator('.topbar-search').boundingBox(),menuRect=await page.locator('.sidebar-collapse-btn').boundingBox()
   assert.ok(menuRect.x+menuRect.width<=searchRect.x,'Search must not cover the sidebar control')
   const targets=await workspace.locator('button:visible,select:visible').evaluateAll(els=>els.filter(e=>!e.disabled).map(e=>({label:e.textContent.trim(),height:e.getBoundingClientRect().height})).filter(e=>e.height<43.5))
   assert.deepEqual(targets,[],'Catalog controls keep touch-sized targets')
   assert.ok((await workspace.locator('.college-health-icon-glyph svg').first().boundingBox()).width>=26,'Keep the existing medical icons at their intended size')
   const panelOverflow=await workspace.locator('.flashcards-college-grid').evaluate(el=>el.scrollWidth>el.clientWidth+1);assert.equal(panelOverflow,false)
   await page.screenshot({path:out+'/captures/'+name+'-'+width+'.png'})
   const present=workspace.getByRole('group',{name:'Présentation des flashcards'})
   await present.getByRole('button',{name:'Ligne',exact:true}).click();await expect(workspace).toHaveClass(/flash-layout-list/)
   const rows=await workspace.locator('.flashcards-college-card').evaluateAll(els=>els.slice(0,3).map(e=>e.getBoundingClientRect().toJSON()))
   assert.ok(rows[1].y>=rows[0].y+rows[0].height,'Line view uses distinct rows');assert.ok((await dimensions(page)).scrollWidth<=width+1)
   if(width===1440)await page.screenshot({path:out+'/captures/'+name+'-list.png'})
   await present.getByRole('button',{name:'Galerie',exact:true}).click()
   const organization=workspace.getByRole('group',{name:'Organisation des flashcards'})
   await organization.getByRole('button',{name:'Item',exact:true}).click();await expect(workspace.locator('.flashcards-item-card')).toHaveCount(4)
   await organization.getByRole('button',{name:'Collège',exact:true}).click();await expect(workspace.locator('.flashcards-college-card')).toHaveCount(all)
   if(width===1440){
    const status=workspace.locator('.flash-workspace-status')
    await expect(status.locator('.flash-status-mastered small')).toHaveText('1');await expect(status.locator('.flash-status-learning small')).toHaveText('1')
    for(const [selector,pct] of [['.flash-status-mastered','100%'],['.flash-status-learning','50%']]){
     await status.locator(selector).click();await expect(workspace.locator('.flashcards-college-card')).toHaveCount(1);await expect(workspace.locator('.flashcards-card-progress strong')).toHaveText(pct)
    }
    await status.locator('.flash-status-unmastered').click();assert.equal(await workspace.locator('.flashcards-college-card').count(),all-2)
    await expect(workspace.locator('.flashcards-card-progress strong').first()).toHaveText('0%')
    await status.locator('.flash-status-all').click()
    const themeSearch=workspace.getByRole('searchbox',{name:'Rechercher une thématique ou un item',exact:true})
    await themeSearch.fill('anesthesie');await expect(workspace.locator('.flashcards-college-card')).toHaveCount(1)
    await themeSearch.fill('aucun-resultat-xyz');await expect(workspace.locator('.flashcards-empty-state')).toBeVisible()
    await workspace.getByRole('button',{name:'Réinitialiser les filtres',exact:true}).click();await expect(themeSearch).toHaveValue('');await expect(workspace.locator('.flashcards-college-card')).toHaveCount(all)
    const itemSearch=workspace.getByRole('searchbox',{name:'Rechercher un item dans les flashcards',exact:true})
    await itemSearch.fill('2');await expect(workspace.locator('.flashcards-college-card')).toHaveCount(1)
    await expect(workspace.locator('.flashcards-card-title h3')).toContainText('Anesthésie')
    await workspace.getByRole('button',{name:'Réinitialiser les filtres',exact:true}).click()
    await workspace.getByRole('combobox',{name:'Filtrer les flashcards par niveau',exact:true}).selectOption('easy')
    await expect(workspace.getByRole('combobox',{name:'Niveau des flashcards',exact:true})).toHaveValue('easy');await expect(workspace.locator('.flashcards-college-card')).toHaveCount(1)
    await workspace.getByRole('combobox',{name:'Niveau des flashcards',exact:true}).selectOption('ALL')
    await workspace.getByRole('combobox',{name:'Trier les flashcards',exact:true}).selectOption('progress');await expect(workspace.getByRole('combobox',{name:'Tri des flashcards',exact:true})).toHaveValue('progress')
    await expect(workspace.locator('.flashcards-card-progress strong').first()).toHaveText('100%')
    await organization.getByRole('button',{name:'Statut',exact:true}).click();await expect(workspace.locator('.flashcards-card-progress strong').first()).toHaveText('0%')
    await organization.getByRole('button',{name:'Item',exact:true}).click();await status.locator('.flash-status-mastered').click();await expect(workspace.locator('.flashcards-item-card')).toHaveCount(1)
    await workspace.getByRole('button',{name:'Réinitialiser les filtres',exact:true}).click();await expect(workspace.locator('.flashcards-item-card')).toHaveCount(4)
    await workspace.locator('.flashcards-card-view').first().click();await expect(page.locator('.flashcards-list-modal')).toBeVisible();await expect(page.locator('.flashcards-list-row')).toHaveCount(2)
    await page.locator('.flashcards-list-modal').getByRole('button',{name:'Fermer la liste des cartes',exact:true}).click()
    await workspace.locator('.flashcards-card-menu').first().click();await expect(page.locator('.flash-generator-modal')).toBeVisible();await page.locator('.flash-generator-modal').getByRole('button',{name:'Fermer',exact:true}).click()
    await workspace.locator('.flashcards-card-launch').first().click();await expect(page.getByRole('dialog',{name:'Révision',exact:true})).toBeVisible();await page.getByRole('dialog',{name:'Révision',exact:true}).getByRole('button',{name:'Quitter',exact:true}).click()
    await workspace.getByRole('button',{name:'Créer une flashcard',exact:true}).click();await expect(page.locator('.flash-create-modal')).toBeVisible();await page.locator('.flash-create-modal').getByRole('button',{name:'Fermer',exact:true}).click()
    await workspace.getByRole('button',{name:'Lancer une révision',exact:true}).click();await expect(page.getByRole('dialog',{name:'Révision',exact:true})).toBeVisible();await page.getByRole('dialog',{name:'Révision',exact:true}).getByRole('button',{name:'Quitter',exact:true}).click()
    await organization.getByRole('button',{name:'Collège',exact:true}).click()
    await workspace.getByRole('searchbox',{name:'Rechercher une thématique ou un item',exact:true}).fill('anatomie')
    await workspace.locator('.flashcards-card-menu').first().click();await expect(page.locator('.flash-generator-modal')).toBeVisible()
    await page.locator('.flash-generator-modal').getByRole('button',{name:'Fermer',exact:true}).click()
    await expect(workspace.locator('.flash-workspace-scope')).toBeVisible();await workspace.getByRole('button',{name:'Effacer les filtres',exact:true}).click()
    await expect(workspace.locator('.flashcards-college-card')).toHaveCount(all)
    await workspace.getByRole('button',{name:'Masquer les filtres',exact:true}).click();await expect(workspace.locator('#flash-workspace-filter-body')).toBeHidden()
    await workspace.getByRole('button',{name:'Afficher les filtres',exact:true}).focus();await page.keyboard.press('Enter');await expect(workspace.locator('#flash-workspace-filter-body')).toBeVisible()
   }else{
    await workspace.getByRole('button',{name:/Afficher les filtres|Masquer les filtres/}).click()
    assert.ok((await dimensions(page)).scrollWidth<=width+1)
   }
   assert.equal(t.saves.length,0,'Catalog interactions must not save account data')
   await page.getByRole('button',{name:'Activer le thème sombre',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
   await page.locator('.dashboard-content').evaluate(el=>el.scrollTop=0);assert.ok((await dimensions(page)).scrollWidth<=width+1)
   if(width===1440||width===768)await page.screenshot({path:out+'/captures/'+name+'-'+width+'-dark.png'})
   assert.deepEqual(t.errors,[]);await expect.poll(()=>t.saves.length).toBe(1)
   results.push({browser:name,width,height,pass:true});console.log(name,width,'PASS');await t.context.close()
  }
  const phone=await setup(browser,390,844,fixture);await phone.page.locator('.mobile-bottom-nav').getByRole('button',{name:'Flashcards',exact:true}).click()
  await expect(phone.page.locator('.flashcards-workspace')).toHaveCount(0);await expect(phone.page.locator('.flashcards-toolbar')).toBeVisible()
  await phone.page.locator('.flashcards-view-switch').click();await expect(phone.page.locator('.flashcards-item-card')).toHaveCount(4)
  await phone.page.setViewportSize({width:1440,height:1000});await expect(phone.page.locator('.flashcards-workspace')).toBeVisible()
  await expect(phone.page.getByRole('group',{name:'Organisation des flashcards'}).getByRole('button',{name:'Item',exact:true})).toHaveAttribute('aria-pressed','true')
  await phone.page.setViewportSize({width:390,height:844});await expect(phone.page.locator('.flashcards-toolbar')).toBeVisible();assert.deepEqual(phone.errors,[]);await phone.context.close()
  const empty=await setup(browser,1440,1000,{trackingState:{items:{}}});await empty.page.locator('.sidebar-nav').getByRole('button',{name:'Flashcards',exact:true}).click()
  await expect(empty.page.locator('.flash-workspace-actions .flashcards-session-btn')).toBeDisabled();await expect(empty.page.locator('.flash-workspace-head p')).toContainText('0/0 items maîtrisés')
  assert.deepEqual(empty.errors,[]);await empty.context.close()
 }finally{await browser.close()}
}
fs.writeFileSync(out+'/validation-flashcards.json',JSON.stringify(results,null,2))
}finally{server.kill('SIGTERM')}
