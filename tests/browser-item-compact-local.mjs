import pg from 'pg'
import argon2 from 'argon2'
import assert from 'node:assert/strict'
import {chromium,webkit,expect} from '@playwright/test'
const pool=new pg.Pool({connectionString:'postgresql://postgres:local-preview-only@127.0.0.1:55432/postgres'})
let id,browser
try{
 const email=`local-ue-${Date.now()}@local.test`,password='Local-UE-2026!'
 id=(await pool.query('INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,$2,$3,NOW()) RETURNING id',[email,'Local UE QA',await argon2.hash(password)])).rows[0].id
 await pool.query("INSERT INTO academic_profiles(user_id,year_code,faculty_id,completed_at,legacy_exempt) VALUES($1,'Y4','dijon',NOW(),false)",[id])
 for(const[name,engine]of[['chrome',chromium],['webkit',webkit]]){
  browser=await engine.launch({headless:true,...(name==='chrome'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})})
  const page=await browser.newPage({viewport:{width:1440,height:1000}})
  await page.goto('http://127.0.0.1:5173/itemstracker/onboarding-preview.html')
  await page.getByRole('textbox',{name:'Adresse e-mail'}).fill(email);await page.getByRole('textbox',{name:'Mot de passe'}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).click()
  await page.locator('.sidebar-nav').getByRole('button',{name:'Items',exact:true}).click()
  const search=page.getByRole('searchbox',{name:'Rechercher un item',exact:true})
  await search.fill('81')
  await page.locator('.items-list-row').filter({has:page.locator('.items-list-number',{hasText:/^#81$/})}).click()
  await page.getByRole('button',{name:'Suivi des révisions',exact:true}).click()
  await page.getByRole('button',{name:'+ Ajouter fiche LISA',exact:true}).click()
  await page.getByRole('button',{name:'+ Ajouter fiche plateforme',exact:true}).click()
  for(const width of[320,360,390,768,820,1024,1220,1440]){
    await page.setViewportSize({width,height:1000})
    const hero=page.locator('.item-detail-hero')
    await hero.scrollIntoViewIfNeeded()
    await page.waitForTimeout(100)
    if(width<=1220){
      const a=await hero.locator('.quiz-trigger-btn').boundingBox(),b=await hero.locator('.item-detail-edit-menu>button').boundingBox(),c=await hero.getByRole('button',{name:/Afficher l.historique/}).boundingBox(),close=await hero.locator('.item-detail-dismiss').boundingBox(),h=await hero.boundingBox()
      assert.ok(Math.abs(a.y-b.y)<2&&Math.abs(a.y-c.y)<2,`${name} ${width}: actions share a row ${JSON.stringify({a,b,c})}`)
      assert.ok(close.y<h.y+15&&Math.abs(close.x+close.width-(h.x+h.width))<15,`${width}: close at top right`)
      for(const box of[a,b,c,close])assert.ok(box.height>=44&&box.width>=44,`${width}: touch targets`)
      for(const card of await page.locator('.college-card,.reference-card').all()){
        const counter=await card.locator('.counter-wrap').boundingBox(),select=await card.locator('select').boundingBox()
        assert.ok(Math.abs(counter.y-select.y)<2,`${name} ${width}: counter and feeling share row ${JSON.stringify({counter,select})}`)
        assert.ok(counter.x+counter.width<=select.x+1,`${width}: no overlap`)
      }
      const local=page.locator('.faculty-item-unit-controls')
      const r=await local.locator('.faculty-item-unit-reviews>div').boundingBox(),f=await local.locator('select').boundingBox()
      assert.ok(Math.abs(r.y-f.y)<2,`${width}: local counter and feeling share row`)
    }
    const notesBox=await page.getByRole('textbox',{name:'Notes pour les prochaines lectures',exact:true}).boundingBox()
    const toggleBox=await page.locator('.item-detail-tabs').boundingBox()
    assert.ok(notesBox.y+notesBox.height<=toggleBox.y,`${width}: selector follows notes`)
    const active=page.locator('.item-detail-tabs>button[aria-pressed="true"]')
    await expect(active).toHaveCount(1)
    assert.equal(await active.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(23, 101, 237)')
    const tabs=await page.locator('.item-detail-tabs>button').evaluateAll(elements=>elements.map(e=>e.getBoundingClientRect().y))
    assert.ok(tabs.every(y=>Math.abs(y-tabs[0])<2),`${width}: tabs share one row`)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} ${width}: no horizontal page overflow`)
    if([390,820,1440].includes(width))await page.screenshot({path:`/tmp/itemstracker-compact-${name}-${width}.png`})
  }
  const notes=page.getByRole('textbox',{name:'Notes pour les prochaines lectures',exact:true})
  await notes.fill('Prévoir une lecture ciblée')
  for(const label of['Ressources','Flashcards','Assignations','Suivi des révisions']){
    const button=page.locator('.item-detail-tabs').getByRole('button',{name:label,exact:true})
    await button.click();await expect(button).toHaveAttribute('aria-pressed','true')
    await expect(notes).toBeVisible();await expect(notes).toHaveValue('Prévoir une lecture ciblée')
  }
  await page.evaluate(()=>document.documentElement.dataset.theme='dark')
  await page.setViewportSize({width:390,height:1000})
  await expect(page.locator('.item-detail-tabs>button[aria-pressed="true"]')).toHaveCSS('color','rgb(255, 255, 255)')
  await page.locator('.item-detail-hero').scrollIntoViewIfNeeded()
  await page.screenshot({path:`/tmp/itemstracker-toggle-${name}-dark.png`})
  await page.evaluate(()=>document.documentElement.dataset.theme='light')
  await page.setViewportSize({width:390,height:1000})
  await page.locator('.item-detail-edit-menu>button').click()
  const popover=page.locator('.item-detail-edit-popover')
  await expect(popover).toBeVisible()
  const box=await popover.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390)
  await popover.getByRole('button',{name:"Fermer le marqueur d'item",exact:true}).click()
  await page.getByRole('button',{name:/Afficher l.historique/}).click()
  await expect(page.locator('.history-modal')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.locator('.item-detail-dismiss').click()
  await expect(page.locator('#items-section>.table-panel')).toBeVisible()
  await browser.close();browser=null;console.log(`${name}: compact header/close, college/sheet/local inline controls, 8 widths, no overflow: OK`)
 }
}finally{await browser?.close();if(id)await pool.query('DELETE FROM users WHERE id=$1',[id]);await pool.end()}
