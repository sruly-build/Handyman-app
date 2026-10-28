import { describe, expect, it } from 'vitest'
import { formatAddress } from './addresses'

describe('formatAddress', () => {
  it('formats a house address', () => {
    expect(
      formatAddress({ housenumber: '12', street: 'Oak Street', city: 'Springfield', state: 'Illinois', postcode: '62704' }),
    ).toBe('12 Oak Street, Springfield, Illinois 62704')
  })
  it('uses town or village when there is no city', () => {
    expect(formatAddress({ street: 'Main Road', village: 'Elmwood', state: 'NY' })).toBe('Main Road, Elmwood, NY')
  })
  it('falls back to a place name when there is no street', () => {
    expect(formatAddress({ name: 'Riverside Plaza', city: 'Austin', state: 'Texas' })).toBe('Riverside Plaza, Austin, Texas')
  })
})
