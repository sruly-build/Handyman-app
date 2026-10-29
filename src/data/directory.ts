import type { Contact } from './types'

/** Categories offered when adding a contact (any other can be typed in) */
export const commonCategories = [
  'Plumbing',
  'Electric',
  'Sheetrock',
  'Shades and blinds',
  'HVAC',
  'Painting',
  'Flooring',
  'Tile',
  'Roofing',
  'Carpentry',
  'Appliance repair',
  'Locksmith',
  'Glass and mirrors',
  'Supplier',
]

/** "Plumbing", "plumber" and "plumbers" all become "plumb", so searching either finds both */
export function stem(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (w.length <= 4) return w
  for (const ending of ['icians', 'ician', 'ical', 'ings', 'ing', 'ers', 'er', 'es', 's']) {
    if (w.endsWith(ending) && w.length - ending.length >= 4) return w.slice(0, -ending.length)
  }
  return w
}

const words = (text: string) => text.split(/[^A-Za-z0-9]+/).filter(Boolean)

/** Does this contact match every word typed in the search box? */
export function matchesSearch(contact: Contact, query: string): boolean {
  const typed = words(query)
  if (typed.length === 0) return true
  const fields = [contact.name, contact.business, contact.categories.join(' '), contact.notes, contact.email, contact.address]
  const haystack = fields.join(' ').toLowerCase()
  const stems = new Set(words(fields.join(' ')).map(stem))
  const digits = contact.phone.replace(/\D/g, '')
  return typed.every((t) => {
    if (/^\d+$/.test(t)) return digits.includes(t)
    const s = stem(t)
    return haystack.includes(t.toLowerCase()) || [...stems].some((x) => x.startsWith(s))
  })
}

/** Every category in use, A to Z, without duplicates that differ only in capitals */
export function categoriesInUse(contacts: Contact[]): string[] {
  const byKey = new Map<string, string>()
  for (const c of contacts) for (const cat of c.categories) if (!byKey.has(cat.toLowerCase())) byKey.set(cat.toLowerCase(), cat)
  return [...byKey.values()].sort((a, b) => a.localeCompare(b))
}

/** Adds a category unless it's already there (ignoring capitals) */
export function addCategory(list: string[], category: string): string[] {
  const clean = category.trim().replace(/\s+/g, ' ')
  if (!clean || list.some((c) => c.toLowerCase() === clean.toLowerCase())) return list
  return [...list, clean.charAt(0).toUpperCase() + clean.slice(1)]
}
