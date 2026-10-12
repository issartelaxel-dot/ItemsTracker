import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {webcrypto} from 'node:crypto'
const code=ts.transpileModule(fs.readFileSync(new URL('../src/lib/usage-tracker.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText.replace('export function','function')
function setup({gpc=false,dnt='0'}={}){
 let stamp=Date.parse('2026-10-12T09:00:00Z'),focus=true,section='flashcards';const timers=new Map(),requests=[],storage=new Map(),win=new EventTarget(),doc=new EventTarget();doc.hidden=false;doc.hasFocus=()=>focus;let id=0
 class Clock extends Date{constructor(...args){super(...(args.length?args:[stamp]))}static now(){return stamp}}
 const env={window:win,document:doc,navigator:{userAgent:'Chrome',doNotTrack:dnt,globalPrivacyControl:gpc},Date:Clock,crypto:webcrypto,AbortSignal,Event,sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},setInterval:(fn,ms)=>{timers.set(++id,{fn,ms,last:stamp});return id},clearInterval:key=>timers.delete(key),fetch:async(url,options)=>{requests.push({url,...options,payload:JSON.parse(options.body)});return{ok:true,json:async()=>({ok:true})}}}
 const ctx=vm.createContext(env);vm.runInContext(code,ctx)
 const settle=()=>new Promise(r=>setImmediate(r))
 return{start:(kind='user')=>ctx.startUsageTracker({kind,apiBase:'https://example.invalid',getSection:()=>section,getToken:()=> 'test-token'}),requests,storage,win,doc,timers,settle,setSection:value=>{section=value;win.dispatchEvent(new Event('itemstracker-section-change'))},setFocus:value=>{focus=value;win.dispatchEvent(new Event(value?'focus':'blur'))},async advance(ms){for(let t=0;t<ms;t+=5000){stamp+=Math.min(5000,ms-t);for(const timer of timers.values())if(stamp-timer.last>=timer.ms){timer.last=stamp;timer.fn()}await settle()}},flush:()=>win.dispatchEvent(new Event('itemstracker-section-change'))}
}
test('active time follows sections, suspends in background and counts reviews without content',async()=>{
 const h=setup(),stop=h.start();await h.settle();await h.advance(30000);assert.equal(h.requests.at(-1).payload.sections[0].seconds,30)
 h.setSection('items');await h.settle();await h.advance(5000);h.win.dispatchEvent(new Event('itemstracker-review'));await h.settle();let payload=h.requests.at(-1).payload;assert.equal(payload.sections.find(s=>s.section==='items').reviews,1);assert.equal(payload.sections.find(s=>s.section==='flashcards').seconds,30)
 h.doc.hidden=true;h.doc.dispatchEvent(new Event('visibilitychange'));await h.settle();payload=h.requests.at(-1).payload;assert.equal(payload.active,false);const before=payload.sections.reduce((sum,s)=>sum+s.seconds,0);await h.advance(60000);h.flush();await h.settle();assert.equal(h.requests.at(-1).payload.sections.reduce((sum,s)=>sum+s.seconds,0),before)
 assert.ok(!JSON.stringify(payload).includes('test-token'));assert.equal(h.requests[0].headers.Authorization,'Bearer test-token');stop();await h.settle();assert.equal(h.timers.size,0)
})
test('visitor IDs stay separate, carry no account credentials and respect privacy preferences',async()=>{
 const h=setup(),stop=h.start('visitor');await h.settle();const visitor=h.requests[0].payload.visitorId;assert.ok(visitor);assert.equal(h.requests[0].credentials,'omit');assert.equal(h.requests[0].headers.Authorization,undefined);assert.equal(h.requests[0].payload.section,'sales');stop();await h.settle();const startAgain=h.start('visitor');await h.settle();assert.equal(h.requests.at(-1).payload.visitorId,visitor);startAgain()
 for(const options of [{gpc:true},{dnt:'1'}]){const disabled=setup(options);disabled.start();await disabled.settle();assert.equal(disabled.requests.length,0);assert.equal(disabled.timers.size,0)}
})
test('idle browser stops heartbeats and time after two minutes',async()=>{
 const h=setup(),stop=h.start();await h.settle();await h.advance(180000);assert.equal(h.requests.at(-1).payload.active,false);assert.ok(h.requests.at(-1).payload.sections[0].seconds<=120);const count=h.requests.length;await h.advance(120000);assert.equal(h.requests.length,count);stop()
})
