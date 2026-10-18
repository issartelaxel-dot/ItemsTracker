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
  await page.locator('.sidebar-nav').getByRole('button',{name:'Flashcards',exact:true}).click()
  const workspace=page.locator('.flashcards-workspace')
  const organize=workspace.getByRole('group',{name:'Organisation des flashcards'})
  await organize.getByRole('button',{name:'Collège',exact:true}).click()
  const search=workspace.getByRole('searchbox',{name:'Rechercher une thématique ou un item',exact:true})
  const layout=workspace.getByRole('group',{name:'Présentation des flashcards'})
  for(const width of[320,390,768,820,1440]){
    await page.setViewportSize({width,height:1000})
    await search.scrollIntoViewIfNeeded()
    await expect(search).toHaveCount(1)
    await expect(workspace.locator('.flash-mobile-level')).toHaveCount(0)
    await expect(workspace.getByRole('combobox',{name:'Filtrer les flashcards par niveau'})).toHaveCount(0)
    const a=await search.locator('..').boundingBox(),b=await layout.boundingBox()
    assert.ok(Math.abs(a.y-b.y)<2&&a.x+a.width<=b.x,`${name} ${width}: search and layout share row`)
    if(width<1024){
      const trigger=workspace.getByRole('button',{name:'Filtres',exact:true}),c=await trigger.boundingBox()
      assert.ok(Math.abs(a.y-c.y)<2&&b.x+b.width<=c.x,`${width}: filters in same row`)
      await trigger.click()
      const sheet=page.locator('.flash-mobile-sheet')
      await expect(sheet.getByRole('combobox',{name:'Niveau des flashcards',exact:true})).toHaveCount(1)
      await sheet.getByRole('button',{name:'Afficher les résultats'}).click()
    } else await expect(workspace.getByRole('combobox',{name:'Niveau des flashcards',exact:true})).toHaveCount(1)
    await layout.getByRole('button',{name:'Ligne',exact:true}).click();await expect(workspace).toHaveClass(/flash-layout-list/)
    await layout.getByRole('button',{name:'Galerie',exact:true}).click();await expect(workspace).toHaveClass(/flash-layout-gallery/)
    await search.fill('aucun-resultat-xyz');await expect(workspace.locator('.flashcards-empty-state')).toBeVisible();await search.fill('')
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}: no page overflow`)
    if([390,820,1440].includes(width))await page.screenshot({path:`/tmp/itemstracker-flash-toolbar-${name}-${width}.png`})
  }
  await browser.close();browser=null;console.log(`${name}: one toolbar, no duplicate level, filters/search/layout usable, five widths: OK`)
 }
}finally{await browser?.close();if(id)await pool.query('DELETE FROM users WHERE id=$1',[id]);await pool.end()}
