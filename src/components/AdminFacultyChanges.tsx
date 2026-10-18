import { useState } from 'react'
import { adminApi } from '../lib/admin-api'

type Request = { id: string; userId: string; facultyName: string | null; yearCode: string; message: string; status: 'pending' | 'approved' | 'rejected'; createdAt: string; changeCount: number; changeLimit: number }
const labels = { pending: 'En attente', approved: 'Autorisée', rejected: 'Refusée' }
export function AdminFacultyChanges() {
  const [requests, setRequests] = useState<Request[] | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function load() {
    setPending(true); setError('')
    try { setRequests((await adminApi<{ requests: Request[] }>('/api/onboarding/admin/faculty-change-requests')).requests) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Chargement impossible.') } finally { setPending(false) }
  }
  async function review(id: string, decision: 'approved' | 'rejected') {
    setPending(true); setError('')
    try { await adminApi(`/api/onboarding/admin/faculty-change-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ decision }) }); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Décision impossible.') } finally { setPending(false) }
  }
  return <details className="admin-availability-requests"><summary>Demandes de changement de faculté</summary><p>Deux changements sont inclus. Chaque autorisation accorde un seul changement supplémentaire, que l’étudiant confirmera lui-même.</p><button type="button" onClick={() => void load()} disabled={pending}>{pending ? 'Chargement…' : requests ? 'Actualiser les demandes' : 'Afficher les demandes'}</button>{error ? <p role="alert">{error}</p> : null}{requests ? <ul>{requests.length === 0 ? <li>Aucune demande.</li> : requests.map(request => <li key={request.id}><strong>Compte #{request.userId} · {request.facultyName || 'Sans faculté'} · {request.yearCode.slice(1)}e année</strong><small>{new Date(request.createdAt).toLocaleString('fr-FR')} · {labels[request.status]} · {request.changeCount}/{request.changeLimit} changements utilisés</small><p>{request.message || 'Sans message'}</p>{request.status === 'pending' ? <div><button type="button" disabled={pending} onClick={() => void review(request.id, 'approved')}>Autoriser un changement supplémentaire</button><button type="button" disabled={pending} onClick={() => void review(request.id, 'rejected')}>Refuser la demande</button></div> : null}</li>)}</ul> : null}</details>
}
