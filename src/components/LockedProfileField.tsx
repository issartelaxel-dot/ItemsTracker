import { useId, useRef, useState } from 'react'
import { Lock, LockSlash, ProfileCircle } from 'iconoir-react'

export function LockedProfileField({ label, value, autoComplete, onChange }: {
  label: string; value: string; autoComplete: string; onChange: (value: string) => void
}) {
  const [unlocked, setUnlocked] = useState(false)
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  return <div className="settings-field settings-locked-field" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setUnlocked(false) }}>
    <label htmlFor={id}>{label}</label>
    <div className={`settings-profile-input ${unlocked ? 'is-unlocked' : 'is-locked'}`}>
      <ProfileCircle aria-hidden="true" />
      <input ref={input} id={id} type="text" autoComplete={autoComplete} value={value} placeholder={label} readOnly={!unlocked} onChange={event => onChange(event.target.value)} />
      <button type="button" className="settings-field-lock" aria-label={`${unlocked ? 'Verrouiller' : 'Déverrouiller'} le ${label.toLocaleLowerCase('fr')}`} aria-pressed={unlocked} aria-controls={id} title={unlocked ? 'Verrouiller ce champ' : 'Déverrouiller pour modifier'} onClick={() => { setUnlocked(!unlocked); if (!unlocked) requestAnimationFrame(() => input.current?.focus()) }}>{unlocked ? <LockSlash aria-hidden="true" /> : <Lock aria-hidden="true" />}</button>
    </div>
  </div>
}
