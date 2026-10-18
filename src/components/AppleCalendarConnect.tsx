import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Laptop, Link, Lock, SmartphoneDevice, Plus, Xmark } from 'iconoir-react'

type Device = { id: string; label: string; last_used_at: string | null }
type Credentials = { id: string; password: string; username: string; server: string; calendarUrl: string }
type Props = { request: (url: string, init?: RequestInit) => Promise<unknown>; timeZone: string }
const platforms = ['iPhone', 'iPad', 'Mac'] as const

function ConnectionDialog({ titleId, onClose, busy, children }: { titleId: string; onClose: () => void; busy: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const dialog = ref.current!
    dialog.showModal()
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus({ preventScroll: true }) }
  }, [])
  return createPortal(<dialog ref={ref} className="apple-setup-dialog" aria-labelledby={titleId} aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <button className="apple-setup-close" type="button" aria-label="Fermer la connexion Apple Calendrier" disabled={busy} onClick={onClose}><Xmark aria-hidden="true" /></button>
    {children}
  </dialog>, document.body)
}

export function AppleCalendarConnect({ request, timeZone }: Props) {
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'connect' | 'devices'>('connect')
  const [step, setStep] = useState(0)
  const [platform, setPlatform] = useState<typeof platforms[number]>('iPhone')
  const [label, setLabel] = useState('Mon iPhone')
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [revokeId, setRevokeId] = useState<string | null>(null)
  const stepTitle = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (open) stepTitle.current?.focus() }, [open, step, mode])
  useEffect(() => {
    if (!open || mode !== 'devices') return
    let alive = true
    void request('/api/calendar/devices').then(result => { if (alive) setDevices((result as { devices: Device[] }).devices) })
      .catch(e => { if (alive) setError((e as Error).message) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open, mode, request])
  const launch = (next: typeof mode) => { setMode(next); setError(''); setCopied(''); setRevokeId(null); setLoading(next === 'devices'); if (next === 'connect' && !credentials) setStep(0); setOpen(true) }
  async function connect() {
    if (busy || !label.trim()) return
    setBusy(true); setError('')
    try {
      const result = await request('/api/calendar/devices', { method: 'POST', body: JSON.stringify({ label: label.trim(), timeZone }) }) as Credentials
      setCredentials(result); setStep(1)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function copy(name: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(name) } catch { setError('La copie automatique est indisponible. Sélectionne le champ pour le copier manuellement.') }
  }
  async function revoke(id: string) {
    setBusy(true); setError('')
    try { await request('/api/calendar/devices/' + encodeURIComponent(id) + '/revoke', { method: 'POST' }); setDevices(old => old.filter(d => d.id !== id)); setRevokeId(null); if (credentials?.id === id) { setCredentials(null); setStep(0) } }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const field = (name: string, value: string) => <label className="apple-setup-field" key={name}><span>{name}</span><span className="apple-setup-copy"><input readOnly value={value} autoComplete="off" spellCheck={false} onFocus={e => e.currentTarget.select()} /><button type="button" aria-label={`Copier ${name.toLowerCase()}`} onClick={() => void copy(name, value)}>{copied === name ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</button></span></label>
  return <>
    <section className="cal-apple-banner" aria-label="Apple Calendrier">
      <div className="cal-apple-banner-content">
        <div className="cal-apple-banner-heading"><span className="cal-apple-app-icon" aria-hidden="true"><span>JUIL.</span><strong>17</strong></span><div><h2>Connecter Apple Calendrier</h2><p>Synchronise automatiquement tes séances ItemsTracker avec ton calendrier Apple.</p></div></div>
        <ul className="cal-apple-benefits"><li><span><Link aria-hidden="true" /></span>Synchronisation<br />automatique</li><li><span><SmartphoneDevice aria-hidden="true" /></span>Tous tes appareils<br />Apple</li><li><span><Lock aria-hidden="true" /></span>Aucun accès<br />iCloud personnel</li></ul>
        <div className="cal-apple-banner-actions"><button className="cal-apple-connect" type="button" aria-haspopup="dialog" onClick={() => launch('connect')}><Plus aria-hidden="true" />Connecter Apple Calendrier</button><button type="button" className="cal-apple-manage" onClick={() => launch('devices')}>Gérer mes appareils</button></div>
      </div>
    </section>
    {open ? <ConnectionDialog titleId={titleId} busy={busy} onClose={() => setOpen(false)}>
      <span className="apple-setup-eyebrow">ITEMSTRACKER × APPLE CALENDRIER</span>
      {mode === 'connect' ? <ol className="apple-setup-steps" aria-label="Étapes de connexion">{['Ton appareil', 'Configuration', 'Terminé'].map((name, index) => <li key={name} className={index <= step ? 'is-active' : ''} aria-current={index === step ? 'step' : undefined}><span>{index < step ? <Check aria-hidden="true" /> : index + 1}</span>{name}</li>)}</ol> : null}
      <h2 id={titleId} ref={stepTitle} tabIndex={-1}>{mode === 'devices' ? 'Tes appareils connectés' : step === 0 ? 'Sur quel appareil veux-tu te connecter ?' : step === 1 ? `Ajoute ItemsTracker sur ton ${platform}` : 'Tout est prêt pour tes séances'}</h2>
      {error ? <p className="apple-setup-error" role="alert">{error}</p> : null}
      {mode === 'devices' ? <>
        <p>Chaque appareil dispose de sa propre connexion. Tu peux retirer son accès à tout moment, en conservant tes séances.</p>
        {loading ? <p role="status">Chargement des appareils…</p> : devices.length ? <ul className="apple-setup-devices">{devices.map(device => <li key={device.id}><div><strong>{device.label}</strong><small>{device.last_used_at ? 'Dernier accès : ' + new Date(device.last_used_at).toLocaleString('fr-FR') : 'Pas encore utilisé dans Apple Calendrier'}</small></div>{revokeId === device.id ? <div className="apple-setup-revoke"><p>Retirer l’accès de cet appareil ? Tes séances sont conservées.</p><button type="button" disabled={busy} onClick={() => setRevokeId(null)}>Annuler</button><button type="button" disabled={busy} onClick={() => void revoke(device.id)}>Confirmer le retrait</button></div> : <button type="button" disabled={busy} onClick={() => setRevokeId(device.id)}>Retirer</button>}</li>)}</ul> : <div className="apple-setup-note">Aucun appareil connecté pour le moment. Connecte ton premier appareil pour retrouver tes séances dans Apple Calendrier.</div>}
        <footer><button type="button" className="apple-setup-primary" disabled={busy || loading} onClick={() => launch('connect')}>Connecter un appareil</button></footer>
      </> : step === 0 ? <form onSubmit={e => { e.preventDefault(); void connect() }}>
        <p>Une connexion dédiée à ItemsTracker, sans utiliser ton mot de passe Apple ni accéder à ton iCloud personnel.</p>
        <fieldset className="apple-setup-platforms" disabled={busy}><legend>Choisir un appareil</legend>{platforms.map(name => <label key={name} className={platform === name ? 'is-selected' : ''}><input type="radio" name="apple-platform" value={name} checked={platform === name} onChange={() => { setPlatform(name); setLabel(`Mon ${name}`) }} />{name === 'Mac' ? <Laptop aria-hidden="true" /> : <SmartphoneDevice aria-hidden="true" />}<span>{name}</span></label>)}</fieldset>
        <label className="apple-setup-field">Nom de l’appareil<input value={label} maxLength={80} required disabled={busy} onChange={e => setLabel(e.target.value)} /></label>
        <div className="apple-setup-note"><Lock aria-hidden="true" /><span>Seul ton calendrier ItemsTracker sera synchronisé. Tes autres calendriers restent privés.</span></div>
        <footer><button type="button" disabled={busy} onClick={() => setOpen(false)}>Plus tard</button><button className="apple-setup-primary" type="submit" disabled={busy || !label.trim()}>{busy ? 'Création de ta connexion…' : 'Créer ma connexion'}</button></footer>
      </form> : step === 1 && credentials ? <>
        <p>Garde cette fenêtre ouverte pendant la configuration. Ces identifiants sont propres à <strong>{label}</strong>.</p>
        <ol className="apple-setup-instructions"><li><span>1</span><div><strong>Ouvre les réglages du calendrier</strong><p>{platform === 'Mac' ? 'Dans Calendrier, ouvre Ajouter un compte → Autre compte CalDAV → Manuel.' : 'Dans les réglages de Calendrier, ouvre Comptes → Ajouter un compte → Autre → Ajouter un compte CalDAV.'}</p></div></li><li><span>2</span><div><strong>Renseigne ces trois champs</strong><p>Utilise les boutons de copie et active SSL dans les réglages du compte.</p></div></li></ol>
        <div className="apple-setup-credentials">{field('Serveur', credentials.server)}{field('Nom d’utilisateur', credentials.username)}{field('Mot de passe dédié', credentials.password)}</div>
        <p className="apple-setup-copy-status" role="status">{copied ? `${copied} copié.` : 'Ces identifiants ne seront plus affichés après cette étape.'}</p>
        <details className="apple-setup-advanced"><summary>Réglages avancés, si nécessaire</summary>{field('URL du calendrier', credentials.calendarUrl)}</details>
        <div className="apple-setup-note">Une fois le compte ajouté, vérifie que le calendrier ItemsTracker est activé dans Apple Calendrier. La fréquence de mise à jour dépend des réglages d’Apple.</div>
        <footer><button className="apple-setup-primary" type="button" onClick={() => { setCredentials(null); setStep(2); setCopied('') }}>J’ai ajouté le compte dans Apple Calendrier</button></footer>
      </> : step === 2 ? <div className="apple-setup-success"><span><Check aria-hidden="true" /></span><p>Ta connexion pour <strong>{label}</strong> est créée. Tes séances apparaîtront dans Apple Calendrier après sa prochaine synchronisation.</p><div className="apple-setup-note">Tu ne vois pas encore tes séances ? Vérifie que le compte est bien ajouté et que le calendrier ItemsTracker est coché dans Apple Calendrier.</div><footer><button type="button" onClick={() => launch('devices')}>Voir mes appareils</button><button type="button" className="apple-setup-primary" onClick={() => setOpen(false)}>Revenir à mon calendrier</button></footer></div> : null}
    </ConnectionDialog> : null}
  </>
}
