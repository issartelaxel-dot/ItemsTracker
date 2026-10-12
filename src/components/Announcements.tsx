import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Xmark } from 'iconoir-react'
import './announcements.css'
type Announcement = {id:number;title:string;summary:string;details:string;version:string;status?:string;published_at?:string;read_at?:string|null}
type CalendarReminder = {id:string;title:string;startAt:string;read_at:string|null}
type Request = (url:string,init?:RequestInit)=>Promise<unknown>
const blank = {title:'',summary:'',details:'',version:''}
async function adminRequest(url:string,init?:RequestInit) {
 const base=(import.meta.env.VITE_API_BASE_URL??'').trim().replace(/\/+$/,'')
 const token=localStorage.getItem('med_auth_token')
 const response=await fetch(base+url,{...init,signal:AbortSignal.timeout(20000),credentials:'include',headers:{'Content-Type':'application/json','X-Client-Version':'0.1.0',...(token?{Authorization:'Bearer '+token} : {}),...init?.headers}})
 const payload=await response.json()
 if(!response.ok)throw new Error(payload.error||'Impossible de joindre le service.')
 return payload
}
export function AdminAnnouncements(){
 const [rows,setRows]=useState<Announcement[]>([]),[form,setForm]=useState(blank),[id,setId]=useState<number|null>(null),[preview,setPreview]=useState(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 const load=useCallback(async()=>{const data=await adminRequest('/api/admin/announcements');setRows(data.announcements);setReady(true)},[])
 useEffect(()=>{const timer=setTimeout(()=>void load().catch(e=>setError(e.message)),0);return()=>clearTimeout(timer)},[load])
 const save=async()=>{setBusy(true);setError('');try{const data=await adminRequest('/api/admin/announcements'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify(form)});setId(data.announcement.id);await load();setMessage('Brouillon enregistré.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const action=async(row:Announcement,action:'publish'|'withdraw')=>{setBusy(true);setError('');try{await adminRequest('/api/admin/announcements/'+row.id+'/'+action,{method:'POST'});await load();if(row.id===id){setId(null);setForm(blank);setPreview(false)}setMessage(action==='publish'?'Annonce publiée dans la cloche.':'Annonce retirée.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <main className="ann-admin"><header><h1>ItemsTracker · Annonces</h1><p>Préparer et publier les nouveautés de l’application.</p></header>
 {error?<p role="alert" className="ann-error">{error}</p>:null}{message?<p role="status">{message}</p>:null}
 {!ready?<p>Connecte-toi avec le compte administrateur dans <a href="./app.html">l’application</a>, puis recharge cette page.</p>:<div className="ann-admin-grid"><section className="ann-card"><h2>{id?'Modifier le brouillon':'Nouvelle annonce'}</h2><form onSubmit={e=>{e.preventDefault();void save()}}>
 <label>Titre<input required maxLength={140} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} /></label>
 <label>Version (facultative)<input maxLength={40} value={form.version} onChange={e=>setForm({...form,version:e.target.value})} /></label>
 <label>Résumé dans la cloche<textarea required maxLength={400} rows={3} value={form.summary} onChange={e=>setForm({...form,summary:e.target.value})} /></label>
 <label>Patchnotes détaillées<textarea required maxLength={20000} rows={10} value={form.details} onChange={e=>setForm({...form,details:e.target.value})} /><small>Texte simple ; les retours à la ligne sont conservés.</small></label>
 <div className="ann-actions"><button disabled={busy} type="submit">Enregistrer le brouillon</button><button type="button" onClick={()=>setPreview(v=>!v)}>Aperçu</button><button type="button" onClick={()=>{setId(null);setForm(blank);setPreview(false)}}>Nouveau</button></div></form>
 {preview?<article className="ann-preview"><small>{form.version}</small><h3>{form.title||'Titre'}</h3><p>{form.summary}</p><div className="ann-details">{form.details}</div></article>:null}</section>
 <section className="ann-card"><h2>Historique et brouillons</h2>{rows.length===0?<p>Aucune annonce.</p>:rows.map(row=><article className="ann-record" key={row.id}><small>{row.status==='draft'?'Brouillon':row.status==='published'?'Publiée':'Retirée'} {row.version}</small><h3>{row.title}</h3><p>{row.summary}</p><div className="ann-actions">{row.status==='draft'?<><button disabled={busy} onClick={()=>{setId(row.id);setForm({title:row.title,summary:row.summary,details:row.details,version:row.version});setPreview(true);setMessage('')}}>Modifier / aperçu</button><button disabled={busy} onClick={()=>{if(window.confirm('Publier cette annonce dans la cloche de tous les utilisateurs ?'))void action(row,'publish')}}>Publier</button></>:null}{row.status==='published'?<button disabled={busy} onClick={()=>{if(window.confirm('Retirer cette annonce de la cloche des utilisateurs ?'))void action(row,'withdraw')}}>Retirer</button>:null}</div></article>)}</section></div>}
 </main>
}
export function AnnouncementBell({request,mobile=false,onCalendar}:{request:Request;mobile?:boolean;onCalendar?:(id:string)=>void}){
 const [rows,setRows]=useState<Announcement[]>([]),[open,setOpen]=useState(false),[selected,setSelected]=useState<Announcement|null>(null),[error,setError]=useState(''),[loaded,setLoaded]=useState(false),[panelTop,setPanelTop]=useState(80)
 const [reminders,setReminders]=useState<CalendarReminder[]>([])
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null)
 const requestRef=useRef(request)
 useEffect(()=>{requestRef.current=request},[request])
 const load=useCallback(async()=>{try{const data=await requestRef.current('/api/announcements') as {announcements:Announcement[]};setRows(data.announcements||[]);setLoaded(true);setError('')}catch{setError('Impossible de charger les nouveautés. Réessaie.')}},[])
 const loadReminders=useCallback(async()=>{try{const data=await requestRef.current('/api/calendar/reminders') as {reminders:CalendarReminder[]};setReminders(data.reminders||[])}catch{/* The announcements inbox also works before calendar deployment. */}},[])
 useEffect(()=>{const refresh=()=>{if(!document.hidden)void loadReminders()};const timer=setTimeout(refresh,0),poll=setInterval(refresh,60000);window.addEventListener('focus',refresh);window.addEventListener('itemstracker-calendar-change',refresh);return()=>{clearTimeout(timer);clearInterval(poll);window.removeEventListener('focus',refresh);window.removeEventListener('itemstracker-calendar-change',refresh)}},[loadReminders])
 const readReminder=async(ids:string[])=>{try{await requestRef.current('/api/calendar/reminders/read',{method:'POST',body:JSON.stringify({ids})});setReminders(old=>old.map(r=>ids.includes(r.id)?{...r,read_at:new Date().toISOString()}:r))}catch{setError('Impossible de marquer le rappel comme lu.')}}
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);const focus=()=>void load();window.addEventListener('focus',focus);return()=>{clearTimeout(timer);window.removeEventListener('focus',focus)}},[load])
 useEffect(()=>{if(!open)return;const click=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus()}};document.addEventListener('pointerdown',click);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',click);document.removeEventListener('keydown',key)}},[open])
 const read=async(ids:number[])=>{try{await request('/api/announcements/read',{method:'POST',body:JSON.stringify({ids})});setRows(old=>old.map(row=>ids.includes(row.id)?{...row,read_at:new Date().toISOString()}:row));setError('')}catch{setError('Impossible de marquer les notifications comme lues.')}}
 const unread=rows.filter(row=>!row.read_at).length+reminders.filter(r=>!r.read_at).length
 return <div className="ann-bell" ref={root}><button ref={trigger} type="button" className={mobile?'mobile-items-notification':'topbar-notification-btn'} aria-label={'Notifications'+(unread?', '+unread+' non lues':'')} aria-expanded={open} aria-controls={mobile?'ann-mobile-panel':'ann-panel'} onClick={()=>{setPanelTop((trigger.current?.getBoundingClientRect().bottom||70)+10);setOpen(v=>!v);setSelected(null);void load();void loadReminders()}}><Bell aria-hidden="true" />{unread?<b className="ann-badge">{unread>99?'99+':unread}</b>:null}</button>
 {open?<section className="ann-panel" style={window.innerWidth<768?{top:panelTop,maxHeight:Math.max(140,window.innerHeight-panelTop-90)}:undefined} id={mobile?'ann-mobile-panel':'ann-panel'} aria-label="Notifications"><header><h2>{selected?'Nouveautés':'Notifications'}</h2><button aria-label="Fermer les notifications" onClick={()=>{setOpen(false);trigger.current?.focus()}}><Xmark aria-hidden="true" /></button></header>
 {error?<p role="alert">{error}<button onClick={()=>void load()}>Réessayer</button></p>:null}
 {selected?<article><button className="ann-back" onClick={()=>setSelected(null)}>← Retour</button><small>{selected.version}</small><h3>{selected.title}</h3><p>{selected.summary}</p><div className="ann-details">{selected.details}</div></article>:<><button className="ann-read-all" disabled={!unread} onClick={()=>{void read(rows.filter(row=>!row.read_at).map(row=>row.id));void readReminder(reminders.filter(r=>!r.read_at).map(r=>r.id))}}>Tout marquer comme lu</button>{!loaded&&!error?<p>Chargement…</p>:null}{loaded&&!rows.length&&!reminders.length?<p className="ann-empty">Aucune nouveauté pour le moment.</p>:null}{reminders.map(r=><button key={'calendar-'+r.id} className={'ann-entry'+(r.read_at?'':' unread')} onClick={()=>{void readReminder([r.id]);setOpen(false);onCalendar?.(r.id)}}><strong>{r.title}</strong><span>Séance prévue à {new Date(r.startAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span><small>Voir dans le calendrier</small></button>)}{rows.map(row=><button className={'ann-entry'+(row.read_at?'':' unread')} key={row.id} onClick={()=>{setSelected(row);if(!row.read_at)void read([row.id])}}><strong>{row.title}</strong><span>{row.summary}</span><small>{row.published_at?new Date(row.published_at).toLocaleDateString('fr-FR'):''}{row.version?' · '+row.version:''} · Voir les nouveautés</small></button>)}</>}
 </section>:null}</div>
}
