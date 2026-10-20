import { useState } from 'react'

type Entry = { sequence: string; operation_id: string; operation: { type: string; path: string[]; value?: unknown }; previous_value: unknown; previous_exists: boolean; created_at: string }
const fields: Record<string, string> = { question: 'Question', answer: 'Réponse', personalNotes: 'Notes de la carte', itemComment: 'Commentaire', comments: 'Notes', name: 'Nom de la fiche', itemLabel: 'Titre de l’item', frontImageDataUrl: 'Image recto', backImageDataUrl: 'Image verso' }
function title(entry: Entry) {
  const path = entry.operation.path, item = path[0] === 'trackingState' ? `Item ${path[2]} · ` : ''
  const last = path.at(-1) || ''
  return item + (fields[last] || (last.startsWith('@') ? 'Carte ou fiche' : path.length === 3 ? 'Item' : 'Préférence'))
}
function preview(value: unknown) {
  if (typeof value !== 'string') return ''
  if (value.startsWith('data:')) return 'Image enregistrée'
  return new DOMParser().parseFromString(value, 'text/html').body.textContent?.slice(0, 180) || 'Contenu vide'
}
export function AutomaticSyncHistory({ request, restore }: { request: (path: string) => Promise<unknown>; restore: (id: string) => Promise<void> }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function load(before?: string) {
    setBusy(true); setMessage('')
    try {
      const result = await request('/api/sync/history' + (before ? '?before=' + encodeURIComponent(before) : '')) as { entries: Entry[]; next: string | null }
      if (!Array.isArray(result.entries)) throw Error('Historique indisponible.')
      setEntries(current => before ? [...current, ...result.entries] : result.entries)
      setNext(result.next)
      if (!result.entries.length && !before) setMessage('Aucune modification enregistrée pour le moment.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Historique indisponible.') }
    finally { setBusy(false) }
  }
  async function recover(id: string) {
    setBusy(true); setMessage('')
    try { await restore(id); await load(); setMessage('La version précédente a été rétablie et enregistrée.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Restauration indisponible.') }
    finally { setBusy(false) }
  }
  const visible = entries.filter(entry => ['set', 'delete', 'restore'].includes(entry.operation.type) && (fields[entry.operation.path.at(-1) || ''] || entry.operation.type === 'delete'))
  return <article className="settings-card settings-card-wide automatic-sync-history">
    <h2>Historique des modifications</h2>
    <p>Retrouve les contenus précédents de tes cartes et de tes notes.</p>
    <button type="button" className="ghost-btn" disabled={busy} onClick={() => void load()}>Consulter l’historique</button>
    {message ? <p role="status">{message}</p> : null}
    <ul>{visible.map(entry => <li key={entry.operation_id}>
      <strong>{title(entry)}</strong> · <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString('fr-FR')}</time>
      {entry.previous_exists ? <><p>{preview(entry.previous_value)}</p><button type="button" className="ghost-btn" disabled={busy} onClick={() => void recover(entry.operation_id)}>Rétablir la version précédente</button></> : <p>Première version enregistrée.</p>}
    </li>)}</ul>
    {next ? <button type="button" className="ghost-btn" disabled={busy} onClick={() => void load(next)}>Modifications plus anciennes</button> : null}
  </article>
}
