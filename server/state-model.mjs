import { z } from 'zod'

export class StateError extends Error {
  constructor(status, code, message, version) {
    super(message)
    this.status = status
    this.code = code
    this.version = version
  }
}

export const persistSchema = z.object({
  trackingState: z.object({ items: z.record(z.string(), z.unknown()) }).passthrough(),
  theme: z.enum(['light', 'dark']),
  focusMode: z.boolean(),
  youtubeDisplayMode: z.enum(['embed', 'external']).default('embed'),
  dateFormat: z.enum(['fr-short', 'fr-long', 'iso']).default('fr-short'),
  timeZone: z.enum(['auto', 'Europe/Paris', 'Asia/Ho_Chi_Minh']).default('auto'),
  shuffleQuizCards: z.boolean().default(false),
  profile: z.record(z.string(), z.unknown()).nullable().default(null),
})

export function assertSafeObject(value) {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) {
      throw new StateError(400, 'INVALID_STATE', 'Clé de données invalide.')
    }
    assertSafeObject(child)
  }
}

export function mergePatch(base, patch) {
  assertSafeObject(patch)
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return structuredClone(patch)
  const result = structuredClone(base && typeof base === 'object' && !Array.isArray(base) ? base : {})
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key]
    else result[key] = mergePatch(result[key], value)
  }
  return result
}

export function defaultState() {
  return persistSchema.parse({ trackingState: { items: {} }, theme: 'light', focusMode: false })
}

export function splitItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new StateError(400, 'INVALID_ITEM', 'Item invalide.')
  }
  const data = structuredClone(item)
  if (data.quiz !== undefined && (!data.quiz || typeof data.quiz !== 'object' || Array.isArray(data.quiz))) throw new StateError(400, 'INVALID_CARDS', 'Quiz invalide.')
  const cards = data.quiz?.cards ?? []
  if (!Array.isArray(cards)) throw new StateError(400, 'INVALID_CARDS', 'Cartes invalides.')
  const ids = new Set()
  for (const card of cards) {
    if (!card || typeof card !== 'object' || typeof card.id !== 'string' || !card.id || card.id.length > 120 || ids.has(card.id)) {
      throw new StateError(400, 'INVALID_CARD', 'Identifiant de carte invalide ou dupliqué.')
    }
    ids.add(card.id)
  }
  if (data.quiz) data.quiz.cards = []
  return { data, cards }
}

export function bytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

export function imageKey(row) {
  return `${row.itemNumber}:${row.cardId}:${row.imageSlot || 'back'}`
}

// Retire les octets des médias des items et des snapshots ; l'API continue à
// accepter le format historique pendant la migration.
export function extractMedia(payload) {
  const state = structuredClone(payload)
  const upsert = []
  for (const [number, item] of Object.entries(state.trackingState.items)) {
    if (!/^\d+$/.test(number) || Number(number) < 1 || Number(number) > 9999) {
      throw new StateError(400, 'INVALID_ITEM', 'Numéro d’item invalide.')
    }
    splitItem(item) // Validate unique card IDs before accepting legacy media.
    for (const card of item.quiz?.cards || []) {
      for (const slot of ['front', 'back']) {
        const value = card[`${slot}ImageDataUrl`] || (slot === 'back' ? card.imageDataUrl : '')
        if (value) upsert.push({ itemNumber: Number(number), cardId: card.id, imageSlot: slot, imageDataUrl: value })
        card[`${slot}ImageDataUrl`] = ''
        if (value) card[`has${slot === 'front' ? 'Front' : 'Back'}ImageDataUrl`] = true
      }
      card.imageDataUrl = ''
    }
  }
  if (state.profile) {
    state.profile.password = ''
    if (typeof state.profile.photoUrl === 'string' && state.profile.photoUrl.startsWith('data:')) {
      upsert.push({ itemNumber: 0, cardId: '__profile__', imageSlot: 'back', imageDataUrl: state.profile.photoUrl })
      state.profile.photoUrl = ''
      state.profile.hasPhoto = true
    }
  }
  return { state, upsert }
}
