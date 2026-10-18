import { AVATAR_SMILEYS } from '../lib/profile-avatar'
import { useId, useLayoutEffect, useRef, useState, type DragEvent } from 'react'
import { EditPencil, MediaImage, ProfileCircle } from 'iconoir-react'

export type AvatarPreferences = {
  photoUrl: string
  avatarGradient: string
  avatarInitialsMode: 'auto' | 'custom' | 'emoji'
  avatarCustomInitials: string
  avatarEmoji: string
}

export function ProfileAvatarEditor({ profile, initials, automaticInitials, gradients, error, onChange, onUpload }: {
  profile: AvatarPreferences; initials: string; automaticInitials: string; gradients: readonly string[]; error: string
  onChange: (patch: Partial<AvatarPreferences>) => void; onUpload: (file: File | null) => Promise<void>
}) {
  const [mode, setMode] = useState<'color' | 'image' | 'initials'>(profile.photoUrl ? 'image' : 'color')
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const panelContainer = useRef<HTMLDivElement>(null)
  const [panelHeight, setPanelHeight] = useState<number>()
  useLayoutEffect(() => {
    const panel = panelContainer.current?.querySelector<HTMLElement>('[data-active="true"]')
    if (!panel) return
    const measure = () => setPanelHeight(panel.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [mode])
  const choose = (next: typeof mode) => { setMode(next); if (next === 'initials') onChange({ photoUrl: '' }) }
  async function upload(file: File | null) { setMode('image'); setUploading(true); try { await onUpload(file) } finally { setUploading(false) } }
  function drop(event: DragEvent<HTMLButtonElement>) { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files?.[0] ?? null) }
  return <div className="settings-avatar-editor">
    <button type="button" className="settings-avatar-preview" aria-label="Modifier la photo de profil" onClick={() => choose('image')}>
      {profile.photoUrl ? <img src={profile.photoUrl} alt="Photo de profil" /> : <span style={{ background: profile.avatarGradient }}>{initials}</span>}
      <span className="settings-avatar-camera"><MediaImage aria-hidden="true" /></span>
    </button>
    <div className="settings-avatar-options"><h3>Photo de profil</h3><p>Personnalise ton avatar avec une couleur, une image ou tes initiales.</p>
      <div className="settings-avatar-actions" role="group" aria-label="Personnalisation de l’avatar">
        <button type="button" aria-pressed={mode === 'color'} aria-controls={`${id}-options`} className={mode === 'color' ? 'is-active' : ''} onClick={() => choose('color')}><EditPencil aria-hidden="true" />Couleur</button>
        <button type="button" aria-pressed={mode === 'image'} aria-controls={`${id}-options`} className={mode === 'image' ? 'is-active' : ''} onClick={() => choose('image')}><MediaImage aria-hidden="true" />Image</button>
        <button type="button" aria-pressed={mode === 'initials'} aria-controls={`${id}-options`} className={mode === 'initials' ? 'is-active' : ''} onClick={() => choose('initials')}><ProfileCircle aria-hidden="true" />Initiales</button>
      </div>
      <div ref={panelContainer} id={`${id}-options`} className="settings-avatar-mode" style={{ height: panelHeight }}>
        <div className="settings-avatar-panel" data-active={mode === 'color'} aria-hidden={mode !== 'color'} inert={mode !== 'color'}><div className="avatar-gradient-grid settings-avatar-colors">{gradients.map((gradient, index) => <button key={gradient} type="button" className={`avatar-gradient-dot ${!profile.photoUrl && profile.avatarGradient === gradient ? 'active' : ''}`} style={{ backgroundImage: gradient }} onClick={() => onChange({ avatarGradient: gradient, photoUrl: '' })} aria-label={`Couleur d’avatar ${index + 1}`} aria-pressed={!profile.photoUrl && profile.avatarGradient === gradient} title={`Couleur ${index + 1}`} />)}</div></div><div className="settings-avatar-panel" data-active={mode === 'image'} aria-hidden={mode !== 'image'} inert={mode !== 'image'}>
          <button type="button" disabled={uploading} className={`settings-avatar-dropzone ${dragging ? 'is-drag-over' : ''}`} onClick={() => input.current?.click()}
            onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragging(true) }}
            onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }} onDrop={drop}>
            <MediaImage aria-hidden="true" /><strong>{uploading ? 'Import de ton image…' : 'Glisse une image ici'}</strong><span>ou clique pour choisir un fichier</span><small>PNG, JPG ou WebP · 1 Mo max</small>
          </button>
          <button className="settings-avatar-remove" type="button" hidden={!profile.photoUrl} disabled={!profile.photoUrl || mode !== 'image'} onClick={() => onChange({ photoUrl: '' })}>Retirer la photo</button>
        </div><div className="settings-avatar-panel" data-active={mode === 'initials'} aria-hidden={mode !== 'initials'} inert={mode !== 'initials'}>
          <div className="settings-avatar-initials-types" role="group" aria-label="Type d’initiales">{([['auto', 'Automatique'], ['custom', 'Personnalisé'], ['emoji', 'Smiley']] as const).map(([value, title]) => <button key={value} type="button" aria-pressed={profile.avatarInitialsMode === value} onClick={() => onChange({ avatarInitialsMode: value, photoUrl: '' })}>{title}</button>)}</div>
          {profile.avatarInitialsMode === 'auto' ? <p className="settings-avatar-auto">{automaticInitials} · D’après ton prénom et ton nom.</p> : profile.avatarInitialsMode === 'custom' ? <label className="settings-avatar-custom">Tes initiales personnalisées<input aria-label="Initiales personnalisées" value={profile.avatarCustomInitials} onChange={event => onChange({ avatarCustomInitials: Array.from(event.target.value.toUpperCase().replace(/\s/g, '')).slice(0, 3).join('') })} placeholder={automaticInitials} autoComplete="off" spellCheck={false} /><small>1 à 3 caractères. Laisse vide pour utiliser les initiales automatiques.</small></label> : <div className="settings-avatar-smileys" role="group" aria-label="Choisir un smiley">{AVATAR_SMILEYS.map(emoji => <button type="button" key={emoji} aria-label={`Smiley ${emoji}`} aria-pressed={profile.avatarEmoji === emoji} onClick={() => onChange({ avatarEmoji: emoji, photoUrl: '' })}>{emoji}</button>)}</div>}
        </div>
      </div>
      {error && mode === 'image' ? <small className="settings-error" role="alert">{error}</small> : null}
    </div>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden-file-input" onChange={event => { void upload(event.target.files?.[0] ?? null); event.target.value = '' }} />
  </div>
}
