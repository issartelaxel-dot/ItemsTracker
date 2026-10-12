import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mountAnnouncements } from '../server/announcements.mjs'

test('announcements: authorization, drafts, publication, per-user reads and withdrawal', async () => {
 const rows=[],reads=new Set()
 const pool={async query(sql,args=[]){
  if(sql.startsWith('SELECT email'))return {rows:[{email:args[0]===1?'hello@setup-hub.com':'user@example.test'}]}
  if(sql.startsWith('SELECT *'))return {rows}
  if(sql.startsWith('INSERT INTO app_announcements(')){const row={id:rows.length+1,title:args[0],summary:args[1],details:args[2],version:args[3],status:'draft'};rows.push(row);return {rows:[row]}}
  if(sql.startsWith('UPDATE app_announcements SET status')){const row=rows.find(r=>r.id===Number(args[1])&&r.status===args[2]);if(!row)return {rows:[]};row.status=args[0];return {rows:[row]}}
  if(sql.startsWith('SELECT a.id'))return {rows:rows.filter(r=>r.status==='published').map(r=>({...r,read_at:reads.has(args[0]+':'+r.id)?'read':null}))}
  if(sql.startsWith('INSERT INTO app_announcement_reads')){for(const id of args[1])if(rows.some(r=>r.id===id&&r.status==='published'))reads.add(args[0]+':'+id);return {rows:[]}}
  throw new Error('Unexpected SQL')
 }}
 const app=express();app.use(express.json());mountAnnouncements(app,{pool,authenticate:req=>req.headers['x-test-user']?{uid:Number(req.headers['x-test-user'])}:null,adminEmails:['hello@setup-hub.com'],limiter:(_req,_res,next)=>next()})
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port
 const call=(url,user,method='GET',body)=>fetch(base+url,{method,headers:{'content-type':'application/json',...(user?{'x-test-user':String(user)}:{})},...(body?{body:JSON.stringify(body)}:{})})
 try {
  assert.equal((await call('/api/admin/announcements')).status,401)
  assert.equal((await call('/api/admin/announcements',2)).status,403)
  assert.equal((await call('/api/admin/announcements',2,'POST',{title:'intrusion'})).status,403)
  assert.equal((await call('/api/admin/announcements',1,'POST',{})).status,400)
  const created=await call('/api/admin/announcements',1,'POST',{title:'Patch',summary:'Résumé',details:'Détails',version:'1.2'});assert.equal(created.status,201)
  assert.deepEqual((await (await call('/api/announcements',2)).json()).announcements,[])
  assert.equal((await call('/api/admin/announcements/1/publish',2,'POST')).status,403)
  assert.equal((await call('/api/admin/announcements/1/publish',1,'POST')).status,200)
  assert.equal((await call('/api/admin/announcements/1/publish',1,'POST')).status,409)
  assert.equal((await (await call('/api/announcements',2)).json()).announcements[0].read_at,null)
  await call('/api/announcements/read',2,'POST',{ids:[1]})
  assert.equal((await (await call('/api/announcements',2)).json()).announcements[0].read_at,'read')
  assert.equal((await (await call('/api/announcements',1)).json()).announcements[0].read_at,null)
  assert.equal((await call('/api/announcements/read',2,'POST',{ids:['1']})).status,400)
  assert.equal((await call('/api/admin/announcements/1/withdraw',1,'POST')).status,200)
  assert.deepEqual((await (await call('/api/announcements',2)).json()).announcements,[])
 } finally {await new Promise(resolve=>server.close(resolve))}
})
