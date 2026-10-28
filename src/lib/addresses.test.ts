import { describe, expect, it } from 'vitest'
import { formatAddress, toSuggestions, typedHouseNumber } from './addresses'

describe('formatAddress', () => {
  it('formats a house address', () => {
    expect(
      formatAddress({ housenumber: '12', street: 'Oak Street', city: 'Springfield', state: 'Illinois', postcode: '62704' }),
    ).toBe('12 Oak Street, Springfield, IL 62704')
  })
  it('uses town or village when there is no city', () => {
    expect(formatAddress({ street: 'Main Road', village: 'Elmwood', state: 'NY' })).toBe('Main Road, Elmwood, NY')
  })
  it('falls back to a place name when there is no street', () => {
    expect(formatAddress({ name: 'Riverside Plaza', city: 'Austin', state: 'Texas' })).toBe('Riverside Plaza, Austin, TX')
  })
})

describe('toSuggestions', () => {
  const street = (name: string, city: string) => ({
    properties: { type: 'street', name, city, state: 'New Jersey', postcode: '08701', countrycode: 'US' },
  })
  it('finds the typed house number', () => {
    expect(typedHouseNumber('120 Clifton Ave')).toBe('120')
    expect(typedHouseNumber('12B Main')).toBe('12B')
    expect(typedHouseNumber('Clifton Ave')).toBeNull()
  })
  it('keeps the typed number on a street without house numbers', () => {
    expect(toSuggestions([street('Clifton Avenue', 'Lakewood')], '120 Clifton')).toEqual([
      '120 Clifton Avenue, Lakewood, NJ 08701',
    ])
  })
  it('puts exact house-number matches first', () => {
    const house = (n: string) => ({
      properties: { housenumber: n, street: 'Main Street', city: 'Toms River', state: 'New Jersey', countrycode: 'US' },
    })
    expect(toSuggestions([house('12'), house('120')], '120 Main')[0]).toBe('120 Main Street, Toms River, NJ')
  })
  it('prefers US results', () => {
    const abroad = { properties: { type: 'street', name: 'Clifton Road', city: 'London', countrycode: 'GB' } }
    expect(toSuggestions([abroad, street('Clifton Avenue', 'Lakewood')], '5 Clifton')).toEqual([
      '5 Clifton Avenue, Lakewood, NJ 08701',
    ])
  })
  it('leaves results alone when no number was typed', () => {
    expect(toSuggestions([street('Clifton Avenue', 'Lakewood')], 'Clifton Ave')).toEqual([
      'Clifton Avenue, Lakewood, NJ 08701',
    ])
  })
})
