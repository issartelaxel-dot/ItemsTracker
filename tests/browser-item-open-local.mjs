import pg from 'pg'
import argon2 from 'argon2'
import assert from 'node:assert/strict'
import { chromium, webkit, expect } from '@playwright/test'
const pool=new pg.Pool({connectionString:'postgresql://postgres:local-preview-only@127.0.0.1:55432/postgres'})
let id,browser
try{
 const email=`open-item-${Date.now()}@local.test`,password='Open-Local-2026!'
 id=(await pool.query('INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,$2,$3,NOW()) RETURNING id',[email,'Item opening',await argon2.hash(password)])).rows[0].id
 await pool.query("INSERT INTO academic_profiles(user_id,year_code,faculty_id,completed_at,legacy_exempt) VALUES($1,'Y4','bordeaux',NOW(),false)",[id])
 const safari=process.env.ITEMS_BROWSER==='webkit'
 browser=safari?await webkit.launch({headless:true}):await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
 const page=await browser.newPage({viewport:{width:1440,height:900},hasTouch:true})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:5173/itemstracker/onboarding-preview.html')
 await page.getByRole('textbox',{name:'Adresse e-mail'}).fill(email);await page.getByRole('textbox',{name:'Mot de passe'}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).click()
 await page.locator('.sidebar-nav').getByRole('button',{name:'Items',exact:true}).click()
 for(const width of[1440,1221,1220,1100,820,768,390]){
  await page.setViewportSize({width,height:900})
  for(const mode of['Grille','Lignes','Matrice']){
   await page.locator('.items-workspace-layout').getByRole('button',{name:mode,exact:true}).click()
   const card=mode==='Matrice'?page.locator('.items-matrix-item').first():page.locator('.items-list-row').first()
   if(width===390)await card.tap();else if(mode==='Grille'){await card.focus();await page.keyboard.press('Enter')}else await card.click()
   const hero=page.locator('.item-detail-hero')
   await expect(hero.locator('h2')).toHaveText('Item #1');await expect(hero).toBeInViewport({ratio:.5})
   if(width<=1220){await expect(page.locator('#items-section>.table-panel')).toBeHidden();await expect(page.getByRole('button',{name:'Retour aux items',exact:true})).toBeVisible()}
   if(width===820&&mode==='Grille')await page.screenshot({path:`/tmp/itemstracker-open-item-${safari?'webkit':'chrome'}-tablet.png`})
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} ${mode}: no overflow`)
   await page.getByRole('button',{name:width<=1220?'Retour aux items':'Masquer le panneau item',exact:true}).click()
   await expect(page.locator('#items-section>.table-panel')).toBeVisible()
   await expect(card).toBeVisible()
  }
 }
 assert.deepEqual(errors,[])
 console.log(`${safari?'WebKit':'Chrome'}: item visible immediately and catalogue restored in grid/list/matrix, 7 widths including breakpoint, keyboard and touch: OK`)
}finally{await browser?.close();if(id)await pool.query('DELETE FROM users WHERE id=$1',[id]);await pool.end()}
