import { z } from 'zod'
export async function initAnnouncements(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS app_announcements (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL, details TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft',
    created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), published_at TIMESTAMPTZ
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS app_announcement_reads (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, announcement_id INTEGER REFERENCES app_announcements(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(user_id, announcement_id)
  )`)
}
const schema = z.object({title:z.string().trim().min(1).max(140),summary:z.string().trim().min(1).max(400),details:z.string().trim().min(1).max(20000),version:z.string().trim().max(40).default('')}).strict()
export function mountAnnouncements(app,{pool,authenticate,adminEmails,limiter}) {
  app.use(['/api/announcements','/api/admin/announcements'],(_req,res,next)=>{res.set('Cache-Control','private, no-store');next()})
  const signedIn=(req,res,next)=>{const auth=authenticate(req);if(!auth)return res.status(401).json({error:'Connecte-toi à ItemsTracker.'});req.announcementUid=Number(auth.uid);if(!Number.isSafeInteger(req.announcementUid)||req.announcementUid<1)return res.status(401).json({error:'Session invalide.'});next()}
  const admin=async(req,res,next)=>{try{const {rows}=await pool.query('SELECT email FROM users WHERE id = $1',[req.announcementUid]);if(!rows[0]||!adminEmails.includes(rows[0].email.toLowerCase()))return res.status(403).json({error:'Accès réservé aux administrateurs.'});next()}catch(e){next(e)}}
  app.param('id',(req,res,next,value)=>{if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<1||Number(value)>2147483647)return res.status(400).json({error:'Identifiant invalide.'});next()})
  app.get('/api/admin/announcements',signedIn,admin,async(_req,res)=>{const {rows}=await pool.query('SELECT * FROM app_announcements ORDER BY created_at DESC');res.json({announcements:rows})})
  app.post('/api/admin/announcements',limiter,signedIn,admin,async(req,res)=>{const data=schema.safeParse(req.body);if(!data.success)return res.status(400).json({error:'Titre, résumé et détails valides sont obligatoires.'});const d=data.data;const {rows}=await pool.query('INSERT INTO app_announcements(title,summary,details,version,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *',[d.title,d.summary,d.details,d.version,req.announcementUid]);res.status(201).json({announcement:rows[0]})})
  app.put('/api/admin/announcements/:id',limiter,signedIn,admin,async(req,res)=>{const data=schema.safeParse(req.body);if(!data.success)return res.status(400).json({error:'Contenu invalide.'});const d=data.data;const {rows}=await pool.query("UPDATE app_announcements SET title=$1,summary=$2,details=$3,version=$4,updated_at=NOW() WHERE id=$5 AND status='draft' RETURNING *",[d.title,d.summary,d.details,d.version,req.params.id]);if(!rows[0])return res.status(409).json({error:'Seuls les brouillons peuvent être modifiés.'});res.json({announcement:rows[0]})})
  app.post('/api/admin/announcements/:id/:action',limiter,signedIn,admin,async(req,res)=>{const {action}=req.params;if(!['publish','withdraw'].includes(action))return res.status(400).json({error:'Action invalide.'});const {rows}=await pool.query(`UPDATE app_announcements SET status=$1,published_at=CASE WHEN $1='published' THEN COALESCE(published_at,NOW()) ELSE published_at END,updated_at=NOW() WHERE id=$2 AND status=$3 RETURNING *`,[action==='publish'?'published':'withdrawn',req.params.id,action==='publish'?'draft':'published']);if(!rows[0])return res.status(409).json({error:'Cette annonce ne peut pas changer de statut.'});res.json({announcement:rows[0]})})
  app.get('/api/announcements',signedIn,async(req,res)=>{const {rows}=await pool.query(`SELECT a.id,a.title,a.summary,a.details,a.version,a.published_at,r.read_at FROM app_announcements a LEFT JOIN app_announcement_reads r ON r.announcement_id=a.id AND r.user_id=$1 WHERE a.status='published' ORDER BY a.published_at DESC LIMIT 100`,[req.announcementUid]);res.json({announcements:rows})})
  app.post('/api/announcements/read',limiter,signedIn,async(req,res)=>{const ids=z.array(z.number().int().positive()).max(100).safeParse(req.body?.ids);if(!ids.success)return res.status(400).json({error:'Liste invalide.'});await pool.query(`INSERT INTO app_announcement_reads(user_id,announcement_id) SELECT $1,id FROM app_announcements WHERE status='published' AND id=ANY($2::int[]) ON CONFLICT DO NOTHING`,[req.announcementUid,ids.data]);res.json({ok:true})})
}
