/**
 * Address suggestions as you type. With a Google Maps key (VITE_GOOGLE_MAPS_KEY)
 * they come from Google Places, which knows house numbers best. Without one,
 * from Photon (https://photon.komoot.io), a free OpenStreetMap search.
 */

const googleKey = (import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined)?.trim() || ''

/** Which service the suggestions come from (shown under the list) */
export const addressSource: 'google' | 'osm' = googleKey ? 'google' : 'osm'

interface GoogleResponse {
  suggestions?: { placePrediction?: { text?: { text?: string } } }[]
}

/** "120 Clifton Ave, Lakewood, NJ, USA" → "120 Clifton Ave, Lakewood, NJ" */
export function fromGoogle(data: GoogleResponse): string[] {
  const seen = new Set<string>()
  return (data.suggestions ?? [])
    .map((s) => (s.placePrediction?.text?.text ?? '').replace(/,\s*USA$/, '').trim())
    .filter((a) => a && !seen.has(a) && seen.add(a))
    .slice(0, 6)
}

// Google bills a typing session (all the letters of one address) together
let session = ''
const newSession = () => (session = crypto.randomUUID())
/** Call when an address is picked, so the next one starts a new session */
export const endAddressSession = () => newSession()

async function searchGoogle(query: string, near: { lat: number; lon: number }, signal?: AbortSignal) {
  if (!session) newSession()
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleKey },
    body: JSON.stringify({
      input: query,
      sessionToken: session,
      includedRegionCodes: ['us'],
      // Nearby first: within about 30 miles counts most
      locationBias: { circle: { center: { latitude: near.lat, longitude: near.lon }, radius: 50000 } },
      origin: { latitude: near.lat, longitude: near.lon },
    }),
  })
  if (!res.ok) throw new Error(`Address search failed (${res.status})`)
  return fromGoogle((await res.json()) as GoogleResponse)
}

interface PhotonProperties {
  name?: string
  housenumber?: string
  street?: string
  city?: string
  town?: string
  village?: string
  district?: string
  state?: string
  postcode?: string
  countrycode?: string
  type?: string
}

interface PhotonResponse {
  features?: { properties?: PhotonProperties }[]
}

const STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME',
  maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
  'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN',
  texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY',
}

/** "12 Oak Street, Springfield, IL 62704" from Photon's pieces */
export function formatAddress(p: PhotonProperties): string {
  const street = [p.housenumber, p.street].filter(Boolean).join(' ')
  // A named place (e.g. a building) without a street goes first on its own
  const first = street || p.name || ''
  const place = p.city || p.town || p.village || p.district || ''
  const state = p.state ? (STATES[p.state.toLowerCase()] ?? p.state) : ''
  const region = [state, p.postcode].filter(Boolean).join(' ')
  const parts = [first, place !== first ? place : '', region].filter(Boolean)
  return parts.join(', ')
}

/** Where the phone is, only if location was already allowed (never asks) */
async function knownLocation(): Promise<{ lat: number; lon: number } | null> {
  try {
    if (!navigator.permissions || !navigator.geolocation) return null
    const status = await navigator.permissions.query({ name: 'geolocation' })
    if (status.state !== 'granted') return null
    return await new Promise((resolve) =>
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(null),
        { maximumAge: 3_600_000, timeout: 3000 },
      ),
    )
  } catch {
    return null
  }
}

/**
 * Where to look first when the phone's location isn't available: Lakewood, NJ,
 * so Toms River, Howell, Jackson and nearby towns come up before anywhere else.
 */
export const HOME_AREA = { lat: 40.0821, lon: -74.2097 }

let bias: Promise<{ lat: number; lon: number } | null> | null = null

/** The house number at the start of what was typed, e.g. "120" from "120 Clifton Av" */
export function typedHouseNumber(query: string): string | null {
  return query.match(/^\s*(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\s/)?.[1] ?? null
}

/**
 * Turns Photon results into addresses. The map data has no house numbers for
 * many streets, so a street-only result keeps the number that was typed.
 */
export function toSuggestions(features: { properties?: PhotonProperties }[], query: string, max = 6): string[] {
  const number = typedHouseNumber(query)
  const all = features.map((f) => f.properties ?? {})
  // Prefer US results; only fall back to others if there are none
  const us = all.filter((p) => !p.countrycode || p.countrycode.toUpperCase() === 'US')
  const props = (us.length ? us : all).map((p) => {
    if (!number || p.housenumber) return p
    const street = p.street || (p.type === 'street' ? p.name : undefined)
    return street ? { ...p, housenumber: number, street, name: undefined } : p
  })
  // Exact house-number matches first, otherwise keep Photon's order (nearest first)
  const ranked = number ? [...props].sort((a, b) => Number(b.housenumber === number) - Number(a.housenumber === number)) : props
  const seen = new Set<string>()
  return ranked
    .map(formatAddress)
    .filter((a) => a && !seen.has(a) && seen.add(a))
    .slice(0, max)
}

export async function searchAddresses(query: string, signal?: AbortSignal): Promise<string[]> {
  bias ??= knownLocation()
  const near = (await bias) ?? HOME_AREA
  if (googleKey) {
    try {
      return await searchGoogle(query, near, signal)
    } catch (err) {
      // Typing on: fall back to the free search if Google is down or the key is wrong
      if (signal?.aborted) throw err
    }
  }
  const params = new URLSearchParams({
    q: query,
    limit: '15',
    lang: 'en',
    lat: String(near.lat),
    lon: String(near.lon),
    // Strongly favour places close by over well-known places far away
    zoom: '12',
    location_bias_scale: '0.1',
  })
  for (const layer of ['house', 'street']) params.append('layer', layer)
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal })
  if (!res.ok) throw new Error(`Address search failed (${res.status})`)
  const data = (await res.json()) as PhotonResponse
  return toSuggestions(data.features ?? [], query)
}
