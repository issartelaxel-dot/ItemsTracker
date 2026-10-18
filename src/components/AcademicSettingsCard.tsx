import { createPortal } from 'react-dom'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Lock, EditPencil } from 'iconoir-react'
import { AcademicSelection, type AcademicProfile, type AcademicYear } from './OnboardingFlow'
import './academic-settings.css'

type Change = { year: AcademicYear; facultyId: string | null; facultyName: string | null; beta: boolean }
const describe = (year: string | null | undefined, faculty: string | null | undefined) => `${year ? `${year.slice(1)}e année` : 'Année non renseignée'} · ${faculty || 'Faculté non renseignée'}`
function PathConfirmation({ current, next, saving, error, changesRemaining, onClose, onConfirm }: {
  current: string; next: string; saving: boolean; error: string; changesRemaining: number | null; onClose: () => void; onConfirm: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  useLayoutEffect(() => {
    const dialog = dialogRef.current!
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    cancelRef.current?.focus()
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus({ preventScroll: true }) }
  }, [])
  return createPortal(<dialog ref={dialogRef} className="academic-path-dialog" aria-labelledby={titleId} aria-busy={saving} onCancel={event => { event.preventDefault(); if (!saving) onClose() }} onClick={event => {
    if (saving || event.target !== event.currentTarget) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
  }}><h2 id={titleId}>Modifier ton parcours de médecine ?</h2><p>Vérifie l’année et la faculté avant de confirmer.</p><dl><div><dt>Parcours actuel</dt><dd>{current}</dd></div><div><dt>Nouveau parcours</dt><dd>{next}</dd></div></dl><p>Tes notes, flashcards et révisions sont conservées.</p>{changesRemaining !== null ? <p className="academic-settings-quota">Ce changement utilisera une autorisation. Il te restera {Math.max(0, changesRemaining - 1)} changement{changesRemaining > 2 ? 's' : ''} de faculté ; au-delà, une demande à l’administration sera nécessaire.</p> : null}{error ? <p role="alert">{error}</p> : null}<div className="academic-settings-actions"><button ref={cancelRef} type="button" className="ghost-btn" disabled={saving} onClick={onClose}>Annuler</button><button type="button" className="academic-submit" disabled={saving} onClick={onConfirm}>{saving ? 'Enregistrement…' : 'Oui, modifier mon parcours'}</button></div></dialog>, document.body)
}

export function AcademicSettingsCard({ profile, request, onSave, onRefresh }: {
  profile: AcademicProfile | null
  request: (url: string, init?: RequestInit) => Promise<Record<string, unknown>>
  onSave: (year: AcademicYear, facultyId: string | null, beta: boolean) => Promise<void>
  onRefresh: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [change, setChange] = useState<Change | null>(null)
  const [saving, setSaving] = useState(false)
  const [popupOpen, setPopupOpen] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [requestSent, setRequestSent] = useState(false)
  const remaining = profile?.facultyChangesRemaining ?? 2
  const willConsume = Boolean(change && change.facultyId !== profile?.facultyId && (profile?.facultyId || (profile?.facultyChangeCount ?? 0) > 0))
  const needsPermission = Boolean(change && change.facultyId !== profile?.facultyId && remaining === 0)
  async function sendRequest() {
    if (!change || saving) return
    setSaving(true); setError('')
    try {
      await request('/api/onboarding/faculty-change-requests', { method: 'POST', body: JSON.stringify({ yearCode: change.year, facultyId: change.facultyId, message }) })
      setRequestSent(true)
      await onRefresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Demande impossible. Réessaie.') }
    finally { setSaving(false) }
  }
  async function refresh() {
    if (saving) return
    setSaving(true); setError('')
    try { await onRefresh() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Actualisation impossible.') } finally { setSaving(false) }
  }
  const editorId = useId()
  const unlock = useRef<HTMLButtonElement>(null)
  const cancel = () => { setEditing(false); setChange(null); setPopupOpen(false); setError(''); setRequestSent(false); setMessage(''); requestAnimationFrame(() => unlock.current?.focus()) }
  async function confirm() {
    if (!change || saving) return
    setSaving(true); setError('')
    try { await onSave(change.year, change.facultyId, change.beta); cancel() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible de modifier ton parcours. Réessaie.'); }
    finally { setSaving(false) }
  }
  return <article className="settings-card settings-card-wide academic-settings-card">
    <div className="academic-settings-summary"><div><h2><Lock aria-hidden="true" />Mon parcours de médecine</h2><p>{describe(profile?.yearCode, profile?.facultyName)}</p></div><button ref={unlock} type="button" className="ghost-btn" aria-expanded={editing} aria-controls={editorId} disabled={saving} onClick={() => editing ? cancel() : setEditing(true)}>{editing ? 'Annuler' : <><EditPencil aria-hidden="true" />Modifier mon parcours</>}</button></div>
    {editing ? <div id={editorId} className="academic-settings-editor">
      <p>La modification de ton parcours adapte les enseignements affichés. Tes notes, flashcards et révisions sont conservées.</p>
      <div hidden={Boolean(change)}><AcademicSelection compact value={profile} request={request} submitLabel="Vérifier les modifications" onSave={async (year, facultyId, beta, facultyName) => {
        if (year === profile?.yearCode && facultyId === profile?.facultyId) { cancel(); return }
        setError(''); setRequestSent(false); setChange({ year, facultyId, facultyName: facultyName || null, beta: Boolean(beta) })
      }} /></div>
      {change ? <div className="academic-settings-confirm" role="group" aria-label="Confirmer le changement de parcours"><h3>{needsPermission ? 'Demander un changement supplémentaire' : 'Confirmer ce changement ?'}</h3>{(change.facultyId !== profile?.facultyId && (remaining === 0 || profile?.facultyChangeRequest)) ? <div className="academic-change-limit"><p>{remaining === 0 ? 'La limite de changements de faculté est atteinte. Choisis la faculté souhaitée pour demander une autorisation à l’administration. Tu peux toujours modifier ton année.' : profile?.facultyChangeRequest?.status === 'approved' ? 'Une autorisation de changement supplémentaire a été accordée.' : 'Tu peux encore changer de faculté dans la limite indiquée.'}</p>{profile?.facultyChangeRequest?.status === 'pending' ? <p role="status">Ta demande est en attente de traitement par l’administration.</p> : null}{profile?.facultyChangeRequest?.status === 'rejected' ? <p>Ta dernière demande a été refusée. Tu peux envoyer une nouvelle demande avec des précisions.</p> : null}<button type="button" className="ghost-btn" disabled={saving} onClick={() => void refresh()}>Actualiser la réponse</button></div> : null}<dl><div><dt>Parcours actuel</dt><dd>{describe(profile?.yearCode, profile?.facultyName)}</dd></div><div><dt>Nouveau parcours</dt><dd>{describe(change.year, change.facultyName)}</dd></div></dl>{needsPermission ? <label className="academic-change-message">Message facultatif<textarea maxLength={2000} rows={3} value={message} onChange={event => { setMessage(event.target.value); setRequestSent(false) }} placeholder="Explique pourquoi tu souhaites changer de faculté…" /></label> : null}{requestSent && needsPermission ? <p role="status">Demande envoyée à l’administration. Ton parcours actuel est conservé.</p> : null}<div className="academic-settings-actions"><button type="button" className="ghost-btn" disabled={saving} onClick={() => { setChange(null); setError('') }}>Revenir aux modifications</button><button type="button" className="academic-submit" disabled={saving || (needsPermission && requestSent)} onClick={() => needsPermission ? void sendRequest() : setPopupOpen(true)}>{saving ? 'En cours…' : needsPermission ? 'Envoyer la demande à l’administration' : 'Confirmer le changement'}</button></div></div> : null}
      {error && !popupOpen ? <p role="alert">{error}</p> : null}
    </div> : null}
    {popupOpen && change ? <PathConfirmation current={describe(profile?.yearCode, profile?.facultyName)} next={describe(change.year, change.facultyName)} saving={saving} error={error} changesRemaining={willConsume ? remaining : null} onClose={() => { setPopupOpen(false); setError('') }} onConfirm={() => void confirm()} /> : null}
  </article>
}
