import { describe, expect, it } from 'vitest'
import { addCategory, categoriesInUse, matchesSearch, stem } from './directory'
import type { Contact } from './types'

const contact = (patch: Partial<Contact>): Contact => ({
  id: '1',
  owner_id: 'me',
  kind: 'vendor',
  address: '',
  name: '',
  business: '',
  categories: [],
  phone: '',
  email: '',
  notes: '',
  created_at: '',
  ...patch,
})

describe('directory search', () => {
  const joe = contact({ name: 'Joe Katz', business: 'JK Plumbing', categories: ['Plumbing', 'Heating'], phone: '(732) 555-1234' })
  const sam = contact({ name: 'Sam', categories: ['Electric'], notes: 'Good with panels' })
  const shades = contact({ name: 'Rivka', business: 'Window Pros', categories: ['Shades and blinds'] })

  it('finds by category, including other forms of the word', () => {
    for (const q of ['plumbing', 'Plumber', 'plumbers', 'plumb']) expect(matchesSearch(joe, q)).toBe(true)
    expect(matchesSearch(sam, 'electrician')).toBe(true)
    expect(matchesSearch(sam, 'electrical')).toBe(true)
    expect(matchesSearch(shades, 'shade')).toBe(true)
    expect(matchesSearch(shades, 'blinds')).toBe(true)
    expect(matchesSearch(sam, 'plumbing')).toBe(false)
  })
  it('finds by name, business, notes and phone', () => {
    expect(matchesSearch(joe, 'katz')).toBe(true)
    expect(matchesSearch(joe, 'JK')).toBe(true)
    expect(matchesSearch(sam, 'panel')).toBe(true)
    expect(matchesSearch(joe, '555')).toBe(true)
    expect(matchesSearch(sam, '555')).toBe(false)
  })
  it('finds clients by address', () => {
    expect(matchesSearch(contact({ kind: 'client', name: 'Sarah', address: '120 Clifton Ave, Lakewood' }), 'lakewood')).toBe(true)
  })
  it('needs every word to match', () => {
    expect(matchesSearch(joe, 'plumbing joe')).toBe(true)
    expect(matchesSearch(joe, 'plumbing sam')).toBe(false)
    expect(matchesSearch(joe, '  ')).toBe(true)
  })
  it('stems words', () => {
    expect(stem('Plumbing')).toBe(stem('plumber'))
    expect(stem('Electrician')).toBe(stem('electrical'))
    expect(stem('Tile')).toBe('tile')
  })
})

describe('categories', () => {
  it('lists each category once, A to Z', () => {
    const list = [contact({ categories: ['Plumbing', 'electric'] }), contact({ categories: ['plumbing', 'Sheetrock'] })]
    expect(categoriesInUse(list)).toEqual(['electric', 'Plumbing', 'Sheetrock'])
  })
  it('adds a category once, tidied', () => {
    expect(addCategory(['Plumbing'], ' plumbing ')).toEqual(['Plumbing'])
    expect(addCategory(['Plumbing'], 'garage  doors')).toEqual(['Plumbing', 'Garage doors'])
    expect(addCategory([], '  ')).toEqual([])
  })
})
