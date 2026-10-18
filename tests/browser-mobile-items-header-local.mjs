import pg from 'pg'
import argon2 from 'argon2'
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:local-preview-only@127.0.0.1:55432/postgres' })
let browser, id
try {
 const email=`header-${Date.now()}@local.test`, password='Header-Local-2026!'
 id=(await pool.query('INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,$2,$3,NOW()) RETURNING id',[email,'Header test',await argon2.hash(password)])).rows[0].id
 await pool.query("INSERT INTO academic_profiles(user_id,year_code,faculty_id,completed_at,legacy_exempt) VALUES($1,'Y4','bordeaux',NOW(),false)",[id])
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
 await page.goto('http://127.0.0.1:5173/itemstracker/onboarding-preview.html')
 await page.getByRole('textbox',{name:'Adresse e-mail'}).fill(email);await page.getByRole('textbox',{name:'Mot de passe'}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).click()
 await page.locator('.mobile-bottom-nav').getByRole('button',{name:'Items',exact:true}).click()
 const header=page.locator('#items-section .table-panel > .panel-head'), bell=header.locator('.ann-bell > button'), profile=header.getByRole('button',{name:'Mon profil et réglages',exact:true})
 for(const width of [320,360,390,430,767]) {
  await page.setViewportSize({width,height:844})
  await expect(bell).toBeVisible();await expect(profile).toBeVisible()
  const b=await bell.boundingBox(),p=await profile.boundingBox()
  assert.ok(Math.abs(p.x-b.x-b.width-8)<1,`${width}: icons remain 8px apart`)
  assert.ok(Math.abs(p.y-b.y)<1,`${width}: icons share a row`)
  assert.ok(b.width>=44&&p.width>=44)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}: no overflow`)
  await bell.click();const panel=page.getByRole('region',{name:'Notifications',exact:true});await expect(panel).toBeVisible()
  const box=await panel.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1)
  await panel.getByRole('button',{name:'Fermer les notifications',exact:true}).click()
  await profile.click();const sheet=page.getByRole('dialog',{name:'Mon profil',exact:true});await expect(sheet).toBeVisible();await sheet.getByRole('button',{name:'Fermer Mon profil',exact:true}).click();await expect(profile).toBeFocused()
  if(width===390)await header.screenshot({path:'/tmp/itemstracker-mobile-header-notifications.png'})
 }
 console.log('Mobile Items header: adjacent 44px notification/profile buttons, aligned at 320–767px, notification panel fits, profile opens and restores focus: OK')
}finally{await browser?.close();if(id)await pool.query('DELETE FROM users WHERE id=$1',[id]);await pool.end()}
