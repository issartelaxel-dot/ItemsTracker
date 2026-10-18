import assert from 'node:assert/strict'
import { test } from 'node:test'
import crypto from 'node:crypto'
import http from 'node:http'
import { createPreviewGateway } from '../ops/test-preview/gateway.mjs'
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)))
const close = server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })
test('Isolated preview requires its own code, authenticates one test user and blocks production side effects', async () => {
  const calls = [], code = crypto.randomBytes(16).toString('hex')
  const upstream = http.createServer((req, res) => {
    calls.push(req.url)
    if (req.url === '/api/auth/login') { res.setHeader('set-cookie', 'med_auth=test-only; HttpOnly; Path=/'); res.end('{"ok":true}'); return }
    if (req.url.startsWith('/dav/')) { res.statusCode = 401; res.setHeader('WWW-Authenticate', 'Basic realm="preview"'); res.end(); return }
    res.setHeader('content-type', 'application/json'); res.end('{"ok":true}')
  })
  const api = await listen(upstream)
  const app = createPreviewGateway({ PREVIEW_ACCESS_HASH: crypto.createHash('sha256').update(code).digest('hex'), PREVIEW_SESSION_SECRET: crypto.randomBytes(32).toString('hex'), PREVIEW_HOST: 'preview.example.test', PREVIEW_ORIGIN: 'http://preview.example.test', BOOTSTRAP_EMAIL: 'test@preview.invalid', BOOTSTRAP_PASSWORD: 'Test-only-password-2026!', PREVIEW_INTERNAL_API: api, PREVIEW_WEB_DIR: '.test-preview-dist' })
  const server = http.createServer(app), base = await listen(server)
  try {
    const before = await fetch(base + '/', { redirect: 'manual' }); assert.equal(before.status, 303)
    assert.equal((await fetch(base + '/api/state')).status, 401)
    const form = await (await fetch(base + '/_preview/access')).text(); assert.ok(form.includes('Ton code d’accès')); assert.ok(!form.includes(code))
    const enter = (value, origin = 'http://preview.example.test') => fetch(base + '/_preview/access', { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: value }), redirect: 'manual' })
    assert.equal((await enter(code, 'https://evil.example')).status, 403)
    assert.equal((await enter('wrong')).status, 401)
    const login = await enter(code); assert.equal(login.status, 303)
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    const auth = { headers: { cookie } }
    assert.equal((await fetch(base + '/', auth)).status, 200)
    assert.equal((await fetch(base + '/api/state', auth)).status, 200)
    for (const endpoint of ['/api/auth/login', '/api/auth/register/request', '/api/auth/password/request', '/api/quiz/generate-mcq', '/api/onboarding/admin/analytics', '/api/admin/academic-catalog']) assert.equal((await fetch(base + endpoint, { ...auth, method: 'POST' })).status, 403)
    assert.deepEqual(calls, ['/api/auth/login', '/api/state'])
    assert.equal((await fetch(base + '/dav/', { redirect: 'manual' })).status, 401)
    const tampered = await fetch(base + '/api/state', { headers: { cookie: cookie.replace(/itemstracker_preview_local=[^;]+/, 'itemstracker_preview_local=invalid') } }); assert.equal(tampered.status, 401)
  } finally { await close(server); await close(upstream) }
})

test('Separate preview codes authenticate distinct accounts while keeping the original code', async () => {
  const codes = ['first-code', 'second-code'], hash = code => crypto.createHash('sha256').update(code).digest('hex')
  const users = [{email:'first@preview.invalid',password:'First-password-2026!'},{email:'second@preview.invalid',password:'Second-password-2026!'}]
  const upstream = http.createServer(async (req,res) => {
    if(req.url==='/api/auth/login') {
      let body='';for await(const chunk of req)body+=chunk
      const credentials=JSON.parse(body), index=users.findIndex(user=>user.email===credentials.email&&user.password===credentials.password)
      if(index<0){res.writeHead(401);res.end();return}
      res.setHeader('set-cookie',`med_auth=user-${index}; HttpOnly; Path=/`);res.end('{}');return
    }
    res.setHeader('content-type','application/json');res.end(JSON.stringify({user:req.headers.cookie?.match(/med_auth=([^;]+)/)?.[1]}))
  })
  const api=await listen(upstream)
  const config={PREVIEW_ACCESS_HASH:hash(codes[0]),PREVIEW_SESSION_SECRET:crypto.randomBytes(32).toString('hex'),PREVIEW_HOST:'preview.example.test',PREVIEW_ORIGIN:'http://preview.example.test',BOOTSTRAP_EMAIL:users[0].email,BOOTSTRAP_PASSWORD:users[0].password,PREVIEW_INTERNAL_API:api,PREVIEW_EXTRA_ACCOUNTS:JSON.stringify([{accessHash:hash(codes[1]),...users[1]}])}
  const server=http.createServer(createPreviewGateway(config)),base=await listen(server)
  try {
    for(const[index,code]of codes.entries()) {
      const login=await fetch(base+'/_preview/access',{method:'POST',headers:{origin:config.PREVIEW_ORIGIN,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code}),redirect:'manual'})
      assert.equal(login.status,303)
      const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')
      assert.deepEqual(await(await fetch(base+'/api/state',{headers:{cookie}})).json(),{user:`user-${index}`})
    }
    assert.throws(()=>createPreviewGateway({...config,PREVIEW_EXTRA_ACCOUNTS:JSON.stringify([{accessHash:hash(codes[0]),...users[1]}])}),/Invalid preview account/)
  } finally {await close(server);await close(upstream)}
})
