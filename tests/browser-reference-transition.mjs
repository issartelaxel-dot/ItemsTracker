import assert from 'node:assert/strict'
import { chromium, webkit, expect } from '@playwright/test'
import pg from 'pg'
import argon2 from 'argon2'
import { randomUUID } from 'node:crypto'
import { readFileSync, mkdirSync } from 'node:fs'
import { createStateStore } from '../server/state-store.mjs'
import { buildReferenceAliases } from '../server/reference-transition.mjs'

const source=JSON.parse(readFileSync(new URL('../src/data/item-reference-assignments.json',import.meta.url)))
const aliases=buildReferenceAliases(source,JSON.parse(readFileSync(new URL('../src/data/items.json',import.meta.url))),JSON.parse(readFileSync(new URL('../src/data/college-tag-aliases.json',import.meta.url))))
const pool=new pg.Pool({connectionString:'postgresql://postgres:local-preview-only@127.0.0.1:55432/postgres'})
const store=createStateStore(pool),userIds=[]
const artifacts=new URL('../.test-preview-release/reference-transition-qa/',import.meta.url);mkdirSync(artifacts,{recursive:true})
const tracker=(patch={})=>({reviews:0,mastery:'Moyen',favorite:false,comments:'',lastReviewedAt:null,reviewHistory:[],...patch})
let browser
try {
 for(const [name,engine] of [['chrome',chromium],['webkit',webkit]]) {
  const email=`transition-${randomUUID()}@local.test`,password='Transition-Local-2026!'
  const uid=Number((await pool.query('INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,$2,$3,NOW()) RETURNING id',[email,'Transition QA',await argon2.hash(password)])).rows[0].id);userIds.push(uid)
  await pool.query("INSERT INTO academic_profiles(user_id,year_code,faculty_id,legacy_exempt,completed_at) VALUES($1,'Y5','dijon',TRUE,NOW())",[uid])
  const retired='MÉDECINE INTENSIVE - RÉANIMATION - URGENCES'
  const retiredTracking=tracker({reviews:1,mastery:'Très bon',favorite:true,comments:'Historical note preserved',lastReviewedAt:'2026-10-01T10:00:00Z',reviewHistory:[{date:'2026-10-01T10:00:00Z',delta:1}]})
  await store.write(uid,'state-full',{baseVersion:0,requestId:randomUUID(),theme:'light',focusMode:false,profile:{firstName:'Transition QA'},trackingState:{items:{
   154:{assignedColleges:['PNEUMOLOGIE',retired],byCollege:{PNEUMOLOGIE:tracker({reviews:2,mastery:'Bon'}),[retired]:retiredTracking},itemMastery:'Très bon',itemComment:'Existing item note',quiz:{cards:[{id:'keep',question:'Question preserved',answer:'Answer preserved'}]}},
   7:{assignedColleges:[],byCollege:{},quiz:{cards:[]}},
  }}})
  const previous=(await store.read(uid)).version
  await store.transitionReferences(uid,{baseVersion:previous,source,resolveAlias:aliases,backupBeforeWrite:async()=>{}})
  browser=await engine.launch({headless:true,...(name==='chrome'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})})
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.route(/https:\/\/(api\.setup-hub\.com|[^/]*onrender\.com)\//,route=>route.abort())
  await page.goto('http://127.0.0.1:5173/itemstracker/onboarding-preview.html')
  await page.getByRole('textbox',{name:'Adresse e-mail'}).fill(email)
  await page.getByRole('textbox',{name:'Mot de passe'}).fill(password)
  await page.getByRole('button',{name:'Se connecter',exact:true}).click()
  const openItem=async number=>{
   await page.locator('.sidebar-nav').getByRole('button',{name:'Items',exact:true}).click()
   await page.getByRole('searchbox',{name:'Rechercher un item',exact:true}).fill(String(number))
   await page.locator('.items-list-row').filter({has:page.locator('.items-list-number',{hasText:new RegExp('^#'+number+'$')})}).click()
  }
  await openItem(154)
  await expect(page.locator('#item-detail-tracking .college-card')).toHaveCount(5)
  await expect(page.locator('.item-detail-stat-grid .item-detail-stat-value').first()).toHaveText('3')
  await expect(page.locator('.manual-item-mastery-select')).toHaveValue('Très bon')
  await expect(page.getByRole('textbox',{name:'Notes pour les prochaines lectures',exact:true})).toHaveValue('Existing item note')
  const previousCollege=page.locator('#item-detail-tracking .college-card').filter({has:page.locator('.college-card-head p span',{hasText:new RegExp('^'+retired+'$')})})
  await expect(previousCollege.locator('textarea')).toHaveValue('Historical note preserved')
  await expect(previousCollege.getByRole('combobox')).toHaveValue('Très bon')
  await expect(previousCollege.locator('.review-count')).toHaveText('1')
  await expect(previousCollege.getByRole('button',{name:'Retirer ce collège des favoris'})).toBeVisible()
  await page.locator('.item-detail-tabs').getByRole('button',{name:'Assignations',exact:true}).click()
  await expect(page.locator('#item-detail-assignments').getByRole('checkbox',{name:new RegExp(retired)})).toBeChecked()
  await page.locator('.item-detail-tabs').getByRole('button',{name:'Suivi des révisions',exact:true}).click()
  await page.getByRole('textbox',{name:'Notes pour les prochaines lectures',exact:true}).fill('Updated note after migration')
  await expect.poll(async()=>(await pool.query('SELECT data FROM user_tracking_items WHERE user_id=$1 AND item_number=154',[uid])).rows[0].data.itemComment,{timeout:20000}).toBe('Updated note after migration')
  const saved=(await pool.query('SELECT data FROM user_tracking_items WHERE user_id=$1 AND item_number=154',[uid])).rows[0].data
  assert.deepEqual(saved.byCollege[retired],retiredTracking)
  assert.deepEqual(saved.referenceTransition.preservedColleges,[retired])
  const pediatric=page.locator('#item-detail-tracking .college-card').filter({has:page.locator('.college-card-head p span',{hasText:/^PÉDIATRIE$/})})
  await expect(pediatric.getByRole('combobox')).toHaveValue('')
  // Selecting the pre-existing default value still counts as an explicit assessment.
  await pediatric.getByRole('combobox').selectOption('Moyen')
  await expect.poll(async()=>(await pool.query('SELECT data FROM user_tracking_items WHERE user_id=$1 AND item_number=154',[uid])).rows[0].data.referenceTransition.pendingColleges.includes('PÉDIATRIE'),{timeout:20000}).toBe(false)
  await page.reload();await openItem(154)
  await expect(page.locator('.item-detail-stat-grid .item-detail-stat-value').first()).toHaveText('3')
  await expect(page.locator('.sidebar-grade')).toHaveText('5e année')
  await page.locator('.item-detail-tabs').getByRole('button',{name:'Flashcards',exact:true}).click();await expect(page.locator('.quiz-card-row')).toHaveCount(1)
  await page.locator('.item-detail-tabs').getByRole('button',{name:'Suivi des révisions',exact:true}).click()
  for(const width of [390,820,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:new URL(`transition-${name}-${width}.png`,artifacts).pathname})}
  await openItem(7);await expect(page.locator('#item-detail-tracking .college-card')).toHaveCount(1);await expect(page.locator('#item-detail-tracking select')).toHaveValue('')
  assert.equal((await pool.query('SELECT year_code FROM academic_profiles WHERE user_id=$1',[uid])).rows[0].year_code,'Y5')
  assert.deepEqual(errors,[])
  await browser.close();browser=null
  console.log(name+': previous college remains checked with reviews/feelings/notes/favorites and totals visible; new reference pending; metadata and assessment survive edit/reload; card/year preserved; phone/tablet/desktop OK.')
 }
}finally{await browser?.close();if(userIds.length)await pool.query('DELETE FROM users WHERE id=ANY($1::bigint[])',[userIds]);await pool.end()}
