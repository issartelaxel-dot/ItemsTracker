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
  for(const width of[1440,390]){
   await page.setViewportSize({width,height:1000})
   for(const[number,codes]of[[81,['4']],[108,['4','5']],[1,[]]]){
    await page.getByRole('searchbox',{name:'Rechercher un item',exact:true}).fill(String(number))
    await page.locator('.items-list-row').filter({has:page.locator('.items-list-number',{hasText:new RegExp(`^#?${number}$`)})}).click()
    const section=page.getByRole('region',{name:'UE locales associées à cet item'})
    await expect(section.getByRole('heading',{name:'Fiches locales',exact:true})).toBeVisible()
    await expect(section.locator('li')).toHaveCount(codes.length)
    for(const code of codes)await expect(section.locator('li strong').filter({hasText:new RegExp(`^UE ${code} ·`)})).toBeVisible()
    if(!codes.length)await expect(section).toContainText('Aucun lien UE–item documenté.')
    await expect(section.locator('a')).toHaveCount(0)
    if(number===108){await section.scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/itemstracker-local-ue-${name}-${width}.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)}
    await page.getByRole('button',{name:width<=1220?'Retour aux items':'Masquer le panneau item',exact:true}).click()
   }
  }
  await page.getByRole('searchbox',{name:'Rechercher un item',exact:true}).fill('108')
  await page.locator('.items-list-row').filter({has:page.locator('.items-list-number',{hasText:/^#108$/})}).click()
  const section=page.getByRole('region',{name:'UE locales associées à cet item'})
  const ue4=section.locator('li').filter({hasText:'UE 4 ·'})
  const ue5=section.locator('li').filter({hasText:'UE 5 ·'})
  const count=ue4.locator('output'),initial=Number(await count.textContent())
  if(initial===0)await expect(ue4.getByRole('button',{name:/Retirer une révision/})).toBeDisabled()
  await ue4.getByRole('button',{name:/Ajouter une révision/}).click({clickCount:2})
  await expect(count).toHaveText(String(initial+2))
  await ue4.getByRole('button',{name:/Retirer une révision/}).click()
  await expect(count).toHaveText(String(initial+1))
  await ue4.getByLabel('Ressenti',{exact:true}).selectOption('Très bon')
  await ue4.getByRole('textbox',{name:'Notes',exact:true}).fill(`${name} : douleur neuropathique`)
  await expect(ue5.locator('output')).toHaveText('0')
  await expect(ue5.getByRole('textbox',{name:'Notes',exact:true})).toHaveValue('')
  // Another item edit must preserve the new UE fields in explicit tracking rebuilds.
  await page.getByLabel('Ajuster le ressenti manuel',{exact:true}).selectOption('Bon')
  await expect.poll(async()=>{
    const row=(await pool.query('SELECT data FROM user_tracking_items WHERE user_id=$1 AND item_number=108',[id])).rows[0]?.data
    return row?.itemMastery==='Bon' && Object.values(row?.localUnits||{}).some(v=>v.comments===`${name} : douleur neuropathique`&&v.reviews===initial+1&&v.mastery==='Très bon')
  },{timeout:20000}).toBe(true)
  await page.setViewportSize({width:1440,height:1000})
  await page.reload()
  await page.locator('.sidebar-nav').getByRole('button',{name:'Items',exact:true}).click()
  await page.getByRole('searchbox',{name:'Rechercher un item',exact:true}).fill('108')
  await page.locator('.items-list-row').filter({has:page.locator('.items-list-number',{hasText:/^#108$/})}).click()
  await expect(count).toHaveText(String(initial+1))
  await expect(ue4.getByLabel('Ressenti',{exact:true})).toHaveValue('Très bon')
  await expect(ue4.getByRole('textbox',{name:'Notes',exact:true})).toHaveValue(`${name} : douleur neuropathique`)
  await ue4.scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/itemstracker-local-ue-tracking-${name}.png`})
  await browser.close();browser=null;console.log(`${name}: Dijon UE4/item81, UE4+5/item108, unmapped item, desktop/mobile, reviews/feeling/notes saved and reloaded: OK`)
 }
}finally{await browser?.close();if(id)await pool.query('DELETE FROM users WHERE id=$1',[id]);await pool.end()}
