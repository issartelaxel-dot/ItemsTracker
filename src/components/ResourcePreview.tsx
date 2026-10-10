import { useEffect, useRef, useState } from 'react'

export type ResourcePreview = {
  title: string
  description: string
  siteName: string
  kind: 'pdf' | 'link'
  byteSize: number | null
  image: { dataUrl: string; kind: 'thumbnail' | 'icon' } | null
}

export function getResourceFallback(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const lastPart = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '')
    const isPdf = /\.pdf$/i.test(url.pathname)
    const title = lastPart.replace(/\.(?:pdf|html?|aspx?)$/i, '').replace(/[-_]+/g, ' ').trim()
    return { title: title || (isPdf ? 'Document PDF' : 'Lien utile'), siteName: url.hostname.replace(/^www\./, ''), kind: isPdf ? 'pdf' as const : 'link' as const }
  } catch { return null }
}

export function formatResourceSize(bytes: number | null) {
  if (!bytes || bytes <= 0) return ''
  return bytes >= 1_000_000 ? (bytes / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo'
    : (bytes / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' Ko'
}

type LoadPreview = (url: string, signal: AbortSignal) => Promise<unknown>

function readPreview(payload: unknown): ResourcePreview | null {
  if (!payload || typeof payload !== 'object' || !('preview' in payload)) return null
  const value = payload.preview
  if (!value || typeof value !== 'object') return null
  const fields = value as Record<string, unknown>
  const text = (key: string, limit: number) => typeof fields[key] === 'string' ? (fields[key] as string).slice(0, limit) : ''
  const image = fields.image as Record<string, unknown> | null
  const validImage = image && typeof image.dataUrl === 'string' && image.dataUrl.length < 280_000 &&
    /^data:image\/(?:png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon);base64,[a-zA-Z0-9+/=\s]+$/.test(image.dataUrl)
  return {
    title: text('title', 180), description: text('description', 240), siteName: text('siteName', 100),
    kind: fields.kind === 'pdf' ? 'pdf' : 'link',
    byteSize: typeof fields.byteSize === 'number' && Number.isSafeInteger(fields.byteSize) && fields.byteSize > 0 ? fields.byteSize : null,
    image: validImage ? { dataUrl: image.dataUrl as string, kind: image.kind === 'thumbnail' ? 'thumbnail' : 'icon' } : null,
  }
}

export function useResourcePreview(url: string, enabled: boolean, load: LoadPreview) {
  const loader = useRef(load)
  loader.current = load
  const [result, setResult] = useState<{ url: string; preview: ResourcePreview | null } | null>(null)
  useEffect(() => {
    if (!enabled || !getResourceFallback(url)) return
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 9500)
    loader.current(url, controller.signal).then(payload => {
      if (!controller.signal.aborted) setResult({ url, preview: readPreview(payload) })
    }).catch(() => { if (!controller.signal.aborted) setResult({ url, preview: null }) })
      .finally(() => clearTimeout(timeout))
    return () => { controller.abort(); clearTimeout(timeout) }
  }, [url, enabled])
  return result?.url === url ? result.preview : null
}

export function ResourceTypeIcon({ kind }: { kind: 'youtube' | 'pdf' | 'link' }) {
  return <span className={'resource-type-icon resource-type-' + kind} aria-hidden="true">
    {kind === 'youtube' ? <svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="5" fill="currentColor" /><path d="m10 9 6 3-6 3Z" fill="white" /></svg>
      : kind === 'pdf' ? <svg viewBox="0 0 24 24" fill="none"><path d="M6 3h8l4 4v14H6Z" fill="currentColor" /><path d="M14 3v5h5M9 17c2-3 3-5 3-8m-3 8c3-1 4-1 6-1" stroke="white" strokeWidth="1.7" strokeLinecap="round" /></svg>
        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m10 14 4-4m-5 2-3 3a3.5 3.5 0 0 0 5 5l3-3m1-5 3-3a3.5 3.5 0 0 0-5-5l-3 3" /></svg>}
  </span>
}

export function ResourceLinkPreview({ url, preview }: { url: string; preview: ResourcePreview | null }) {
  const fallback = getResourceFallback(url)
  const [failedImage, setFailedImage] = useState('')
  if (!fallback) return null
  const image = preview?.image
  const dataUrl = image?.dataUrl
  const isPdf = fallback.kind === 'pdf' || preview?.kind === 'pdf'
  return <a className="resource-link-preview" href={url} target="_blank" rel="noopener noreferrer">
    {dataUrl && failedImage !== dataUrl
      ? <img className={'resource-preview-image is-' + (image?.kind || 'icon')} src={dataUrl} alt="" loading="lazy" onError={() => setFailedImage(dataUrl)} />
      : <ResourceTypeIcon kind={isPdf ? 'pdf' : 'link'} />}
    <span className="resource-preview-copy">
      <strong>{preview?.title || fallback.title}</strong>
      {preview?.description ? <span className="resource-preview-description">{preview.description}</span> : null}
      <small>{preview?.siteName || fallback.siteName}{isPdf ? ' · PDF' : ''}{formatResourceSize(preview?.byteSize ?? null) ? ' · ' + formatResourceSize(preview?.byteSize ?? null) : ''}</small>
    </span>
    <span className="resource-preview-open" aria-hidden="true">↗</span>
  </a>
}
