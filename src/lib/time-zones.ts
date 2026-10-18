import cityData from '../data/time-zone-cities-fr.json' with { type: 'json' }
import zones from '../data/time-zones.json' with { type: 'json' }

export function isTimeZonePreference(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 100) return false
  if (value === 'auto') return true
  try { new Intl.DateTimeFormat('fr-FR', { timeZone: value }); return true }
  catch { return false }
}
export function normalizeTimeZonePreference(value: unknown): string {
  return isTimeZonePreference(value) ? value : 'auto'
}
const regions: Record<string, string> = {
  Africa: 'Afrique', America: 'Amériques', Antarctica: 'Antarctique', Arctic: 'Arctique',
  Asia: 'Asie', Atlantic: 'Atlantique', Australia: 'Australie', Europe: 'Europe',
  Indian: 'Océan Indien', Pacific: 'Pacifique', UTC: 'Temps universel',
}
const cities: Record<string, string> = cityData.cities
export function getTimeZoneLabel(value: string): string {
  if (value === 'auto') return 'Automatique'
  if (value === 'UTC') return 'UTC · Temps universel'
  if (!isTimeZonePreference(value)) return 'Fuseau inconnu'
  const canonical = new Intl.DateTimeFormat('fr-FR', { timeZone: value }).resolvedOptions().timeZone
  const region = regions[value.split('/')[0]] || regions[canonical.split('/')[0]] || 'Autres fuseaux'
  const city = cities[value] || cities[canonical] || canonical.split('/').at(-1)!.replaceAll('_', ' ')
  return `${region} · ${city}`
}
export function getTimeZoneDescription(value: string): string {
  if (value === 'auto') return 'Utilise le fuseau de ton appareil'
  if (!isTimeZonePreference(value)) return ''
  return new Intl.DateTimeFormat('fr-FR', { timeZone: value, timeZoneName: 'longGeneric' }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value || ''
}
export function getTimeZoneGroups(selected = 'auto') {
  const supported = [...new Set([...zones, ...(selected !== 'auto' && isTimeZonePreference(selected) ? [selected] : [])])].filter(isTimeZonePreference)
  return Object.entries(regions).map(([region, label]) => ({
    label,
    options: supported.filter(zone => zone.split('/')[0] === region).sort().map(value => ({ value, label: getTimeZoneLabel(value) })),
  })).concat([{
    label: 'Autres fuseaux', options: supported.filter(zone => !(zone.split('/')[0] in regions)).sort().map(value => ({ value, label: getTimeZoneLabel(value) })),
  }]).filter(group => group.options.length > 0)
}
