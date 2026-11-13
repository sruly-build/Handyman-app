import type { PlanTier, ServiceRequest, ServiceSettings, Urgency } from './types'

/** "12 Oak Street Apt 2, Lakewood, NJ" → "12 oak st" (same rules as the database's address_key) */
export function addressKey(address: string): string {
  let s = (address.split(',')[0] ?? '').toLowerCase()
  s = s.replace(/\s+(apt|apartment|unit|suite|ste|fl|floor|bsmt|basement|upstairs|downstairs)\b.*$/, '')
  s = s.replace(/\s*#.*$/, '')
  s = s.replace(/[^a-z0-9 ]/g, ' ')
  s = ` ${s.trim().replace(/\s+/g, ' ')} `
  const pairs: [string, string][] = [
    ['street', 'st'], ['avenue', 'ave'], ['av', 'ave'], ['road', 'rd'], ['drive', 'dr'], ['lane', 'ln'], ['court', 'ct'],
    ['place', 'pl'], ['boulevard', 'blvd'], ['terrace', 'ter'], ['circle', 'cir'], ['parkway', 'pkwy'], ['highway', 'hwy'],
    ['square', 'sq'], ['north', 'n'], ['south', 's'], ['east', 'e'], ['west', 'w'],
  ]
  for (const [long, short] of pairs) s = s.replace(` ${long} `, ` ${short} `)
  return s.trim()
}

export const defaultTiers: PlanTier[] = [
  {
    id: 'basic', name: 'Basic', price: 49, hours: 1, every_months: 2, cap: 6, expire_months: 12, active: true,
    services: ['1 hour of handyman work every 2 months', 'Unused hours roll over (up to 6)', 'Parts at cost plus 20%, with your approval'],
  },
  {
    id: 'premium', name: 'Premium', price: null, hours: 1, every_months: 2, cap: 6, expire_months: 12, active: false,
    services: ['Everything in Basic', 'Dryer vent cleaning', 'Gutter cleaning', 'Sprinkler shut-off and turn-on', 'Smoke and CO detector testing', 'Yearly re-inspection'],
  },
]

export const defaultTurnoverChecklist = [
  'Patch and paint walls', 'Clean or replace HVAC filter', 'Test smoke and CO detectors', 'Check all outlets and switches',
  'Check faucets, drains and toilets for leaks', 'Check doors, locks and windows', 'Replace burnt-out bulbs',
  'Check cabinets and drawers', 'Caulk tubs, showers and sinks', 'Check appliances work', 'Final clean',
]

export const defaultSeasonal = {
  winter: ['Shut off and drain outside hose bibs', 'Test the heat', 'Replace the HVAC filter', 'Check weatherstripping and door sweeps', 'Test smoke and CO detectors', 'Check for drafts at windows'],
  spring: ['Turn on outside water and check for leaks', 'Test the AC', 'Replace the HVAC filter', 'Check gutters and downspouts', 'Check caulking at tubs and sinks', 'Look for winter damage outside'],
}

export function defaultServiceSettings(companyId: string, slug = 'demo'): ServiceSettings {
  return {
    company_id: companyId, public_slug: slug, emergency_fee: 150, filter_months: 4, repeat_threshold: 3,
    nearby_miles: 3, parts_auto_approve: 25, review_url: '', whatsapp: '', emergency_phone: '',
    plan_tiers: defaultTiers, addons: [], turnover_checklist: [], seasonal_checklists: { winter: [], spring: [] },
    updated_at: new Date().toISOString(),
  }
}

/** The plan offered (the first active tier) */
export const activeTier = (s: Pick<ServiceSettings, 'plan_tiers'>): PlanTier | null =>
  s.plan_tiers.find((t) => t.active) ?? null

/** Lowercase letters, numbers and dashes (for the request page address) */
export const cleanSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

export const money = (n: number | null | undefined) =>
  n == null ? '' : `$${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`

/** When we should get there: same day, in a few days, or with the next visit nearby */
export function suggestedTimeframe(u: Urgency): string {
  return u === 'emergency' ? 'Same day' : u === 'soon' ? 'In the next few days' : 'With the next visit nearby'
}

export type RequestFlag =
  | 'emergency'
  | 'needs_approval'
  | 'address_needed'
  | 'photo_needed'
  | 'unverified'
  | 'over_hour'
  | 'repeat'

export const flagLabels: Record<RequestFlag, string> = {
  emergency: 'Emergency',
  needs_approval: 'Needs landlord approval',
  address_needed: 'Address needed',
  photo_needed: 'Photo needed',
  unverified: 'Unverified requester',
  over_hour: 'Over an hour',
  repeat: 'Repeat issue',
}

/** The flags shown on a request in the inbox */
export function requestFlags(r: ServiceRequest, repeatKeys: Set<string> = new Set()): RequestFlag[] {
  const flags: RequestFlag[] = []
  if (r.urgency === 'emergency') flags.push('emergency')
  if (r.needs_approval) flags.push('needs_approval')
  if (r.address_needed || !r.address.trim()) flags.push('address_needed')
  if (r.photo_needed) flags.push('photo_needed')
  if (r.is_member && !r.verified && r.requester_kind !== 'landlord') flags.push('unverified')
  if (r.over_hour) flags.push('over_hour')
  if (r.issues.some((i) => repeatKeys.has(`${r.property_id}:${i.key}`))) flags.push('repeat')
  return flags
}

/**
 * Issues that keep coming back at a house: the same quick pick at least
 * `threshold` times in the last 12 months. Returns "houseId:issueKey" keys.
 */
export function repeatIssues(requests: ServiceRequest[], threshold: number, now = new Date()): Set<string> {
  const since = now.getTime() - 365 * 24 * 3600 * 1000
  const counts = new Map<string, number>()
  for (const r of requests) {
    if (!r.property_id || Date.parse(r.created_at) < since) continue
    for (const key of new Set(r.issues.map((i) => i.key))) {
      if (key === 'other') continue
      const k = `${r.property_id}:${key}`
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
  }
  return new Set([...counts].filter(([, n]) => n >= Math.max(1, threshold)).map(([k]) => k))
}

/** Straight-line distance in miles */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 3958.8 * 2 * Math.asin(Math.sqrt(h))
}

type Spot = { lat: number; lng: number }
const hasSpot = (r: ServiceRequest): r is ServiceRequest & Spot => r.lat != null && r.lng != null

/**
 * Open "Whenever" requests within `miles` of this one, in a sensible driving
 * order: always go to the nearest one left next.
 */
export function nearbyWhenever(target: ServiceRequest, all: ServiceRequest[], miles: number): ServiceRequest[] {
  if (!hasSpot(target)) return []
  const left = all.filter(
    (r): r is ServiceRequest & Spot =>
      r.id !== target.id && r.urgency === 'whenever' && (r.status === 'new' || r.status === 'scheduled') &&
      hasSpot(r) && milesBetween(target, r) <= miles,
  )
  const route: ServiceRequest[] = []
  let here: Spot = target
  while (left.length) {
    left.sort((a, b) => milesBetween(here, a) - milesBetween(here, b))
    const next = left.shift()!
    route.push(next)
    here = next
  }
  return route
}

/** Inbox order: emergencies first, then soon, then whenever; oldest first in each */
export function inboxOrder(a: ServiceRequest, b: ServiceRequest): number {
  const rank = { emergency: 0, soon: 1, whenever: 2 }
  return rank[a.urgency] - rank[b.urgency] || a.created_at.localeCompare(b.created_at)
}

/** One line about a request: "Unclog a sink, Door knob or lock" */
export function issueSummary(r: Pick<ServiceRequest, 'issues' | 'punch_list'>): string {
  const parts = r.issues.map((i) => (i.key === 'other' ? i.text || 'Other' : i.label || i.text)).filter(Boolean)
  if (parts.length) return parts.join(', ')
  return r.punch_list ? r.punch_list.split('\n')[0] : 'Repair request'
}

/** Ready-to-send texts for the owner (sent from their own phone) */
export function readyReply(
  kind: 'photo' | 'address' | 'scheduled' | 'received',
  r: Pick<ServiceRequest, 'requester_name' | 'scheduled_at' | 'status_token'>,
  business: string,
  origin = typeof window === 'undefined' ? '' : window.location.origin,
): string {
  const first = r.requester_name.trim().split(/\s+/)[0]
  const hi = first ? `Hi ${first}, ` : 'Hi, '
  const from = business ? ` – ${business}` : ''
  const status = r.status_token ? `\nStatus: ${origin}/s/${r.status_token}` : ''
  if (kind === 'photo') return `${hi}thanks for your repair request. Could you send a photo of the problem? It helps us bring the right parts.${from}`
  if (kind === 'address') return `${hi}thanks for your repair request. What's the address (and apartment, if any)?${from}`
  if (kind === 'scheduled' && r.scheduled_at) {
    const when = new Date(r.scheduled_at)
    const day = when.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    const time = when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return `${hi}we're scheduled to come ${day} at ${time} for your repair request.${status}${from}`
  }
  return `${hi}we got your repair request and will be in touch to set a time.${status}${from}`
}

/** A pasted list ("1. Paint hall\n- Fix sink") as separate items */
export function splitList(text: string): string[] {
  return text
    .split(/\n|;/)
    .map((l) => l.replace(/^\s*(?:[-*•▪◦]|\d+[.)]|\[[ x]?\])\s*/i, '').trim())
    .filter((l) => l.length > 1)
    .slice(0, 60)
}
