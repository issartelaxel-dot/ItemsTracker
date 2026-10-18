// Read-only smoke test of the second tester's code. Does not submit onboarding.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {chromium,expect} from '@playwright/test'
const access=JSON.parse(fs.readFileSync('.test-preview-release/second-access.json','utf8'))
assert.equal(new URL(access.url).hostname,'test-itemstracker-20261015.167.233.129.21.sslip.io')
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:390,height:844}})
 await page.route(/https:\/\/(api\.setup-hub\.com|[^/]*onrender\.com|n8n\.setup-hub\.com)\//,route=>route.abort())
 await page.goto(access.url)
 await page.getByLabel('Ton code d’accès').fill(access.code)
 await page.getByRole('button',{name:'Accéder à la version de test',exact:true}).click()
 await expect(page.getByRole('heading',{name:'En quelle année de médecine es-tu ?'})).toBeVisible({timeout:30000})
 const headers={'x-client-version':'0.1.1'}
 const me=await(await page.request.get(access.url+'api/auth/me',{headers})).json()
 assert.equal(me.user.email,access.email)
 assert.equal(me.onboarding.required,true)
 assert.equal(me.onboarding.profile?.facultyId??null,null)
 const state=await(await page.request.get(access.url+'api/state',{headers})).json()
 assert.equal(state.state,null)
 assert.equal(await page.locator('.academic-year').count(),3)
 console.log('Second code opens a distinct new account: required onboarding, no faculty, no saved tracking. HTTPS browser form OK.')
}finally{await browser.close()}
