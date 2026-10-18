import pg from 'pg'
import argon2 from 'argon2'
import assert from 'node:assert/strict'
import {chromium,webkit,expect} from '@playwright/test'
const pool=new pg.Pool({connectionString:'postgresql://postgres:local-preview-only@127.0.0.1:55432/postgres'})
let id,browser
try{
 for(const[name,engine]of[['chrome',chromium],['webkit',webkit]]){
  const email=`empty-sheets-${name}-${Date.now()}@local.test`,password='Local-UE-2026!'
  id=(await pool.query('INSERT INTO users(email,display_name,password_hash,created_at) VALUES($1,$2,$3,NOW()) RETURNING id',[email,'Empty sheets QA',await argon2.hash(password)])).rows[0].id
  await pool.query("INSERT INTO academic_profiles(user_id,year_code,faculty_id,completed_at,legacy_exempt) VALUES($1,'Y4','dijon',NOW(),false)",[id])
  browser=await engine.launch({headless:true,...(name==='chrome'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})})
  const page=await browser.newPage({viewport:{width:1440,height:1000}})
  await page.goto('http://127.0.0.1:5173/itemstracker/onboarding-preview.html')
  await page.getByRole('textbox',{name:'Adresse e-mail'}).fill(email);await page.getByRole('textbox',{name:'Mot de passe'}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).click()
  await page.locator('.sidebar-nav').getByRole('button',{name:'Items',exact:true}).click()
  await page.getByRole('searchbox',{name:'Rechercher un item',exact:true}).fill('1')
  await page.locator('.items-list-row').filter({has:page.locator('.items-list-number',{hasText:/^#1$/})}).click()
  const local=page.getByRole('region',{name:'UE locales associées à cet item'})
  await expect(local).toHaveClass(/is-empty/)
  for(const width of[320,390,820,1440]){
    await page.setViewportSize({width,height:1000})
    await local.scrollIntoViewIfNeeded()
    assert.ok((await local.boundingBox()).height<90,`${width}: compact local empty state`)
    for(const title of['Fiches LISA','Fiches Plateformes']){
      const section=page.getByRole('region',{name:title,exact:true})
      await expect(section.getByRole('checkbox',{name:'Pas de fiche',exact:true})).toBeVisible()
      const b=await section.boundingBox();assert.ok(b.height<110,`${name} ${width}: compact empty section ${b.height}`)
      const label=await section.locator('label').boundingBox(),button=await section.getByRole('button').boundingBox()
      assert.ok(Math.abs(label.y-button.y)<2&&label.x+label.width<=button.x,`${width}: checkbox and add button share a row`)
      assert.ok(button.height>=44)
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    if(width===390)await page.screenshot({path:`/tmp/itemstracker-empty-sheets-${name}.png`})
  }
  await page.setViewportSize({width:390,height:1000})
  page.on('dialog',dialog=>dialog.accept())
  for(const[title,button,deleteLabel]of[['Fiches LISA','+ Ajouter fiche LISA','Supprimer cette fiche LISA'],['Fiches Plateformes','+ Ajouter fiche plateforme','Supprimer cette fiche plateforme']]){
    const section=page.getByRole('region',{name:title,exact:true})
    const checkbox=section.getByRole('checkbox',{name:'Pas de fiche',exact:true})
    await checkbox.setChecked(true);await expect(checkbox).toBeChecked()
    await section.getByRole('button',{name:button,exact:true}).click()
    await expect(section).toHaveCount(0)
    const remove=page.getByRole('button',{name:deleteLabel,exact:true})
    await expect(remove).toBeVisible()
    await remove.click()
    await expect(section).toBeVisible();await expect(checkbox).not.toBeChecked()

  }
  await browser.close();browser=null;await pool.query('DELETE FROM users WHERE id=$1',[id]);id=null;console.log(`${name}: compact empty sections at four widths; exclusion/add/delete controls work: OK`)
 }
}finally{await browser?.close();if(id)await pool.query('DELETE FROM users WHERE id=$1',[id]);await pool.end()}
