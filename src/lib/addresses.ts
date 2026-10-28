/**
 * Address suggestions from Photon (https://photon.komoot.io), a free
 * OpenStreetMap search that is built for search-as-you-type and needs no key.
 */

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

/** "12 Oak Street, Springfield, IL 62704" from Photon's pieces */
export function formatAddress(p: PhotonProperties): string {
  const street = [p.housenumber, p.street].filter(Boolean).join(' ')
  // A named place (e.g. a building) without a street goes first on its own
  const first = street || p.name || ''
  const place = p.city || p.town || p.village || p.district || ''
  const region = [p.state, p.postcode].filter(Boolean).join(' ')
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

let bias: Promise<{ lat: number; lon: number } | null> | null = null

export async function searchAddresses(query: string, signal?: AbortSignal): Promise<string[]> {
  bias ??= knownLocation()
  const near = await bias
  const params = new URLSearchParams({ q: query, limit: '6', lang: 'en' })
  for (const layer of ['house', 'street']) params.append('layer', layer)
  if (near) {
    params.set('lat', String(near.lat))
    params.set('lon', String(near.lon))
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal })
  if (!res.ok) throw new Error(`Address search failed (${res.status})`)
  const data = (await res.json()) as PhotonResponse
  const seen = new Set<string>()
  return (data.features ?? [])
    .map((f) => formatAddress(f.properties ?? {}))
    .filter((a) => a && !seen.has(a) && seen.add(a))
}
