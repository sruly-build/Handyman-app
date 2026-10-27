import { describe, expect, it } from 'vitest'
import { directionsLink, phoneLink } from './links'

describe('links', () => {
  it('strips formatting from phone numbers', () => {
    expect(phoneLink('(555) 123-4567')).toBe('tel:5551234567')
    expect(phoneLink('+44 20 7946 0000')).toBe('tel:+442079460000')
  })
  it('encodes addresses for maps', () => {
    expect(directionsLink('12 Oak St, Springfield')).toBe('https://maps.apple.com/?daddr=12%20Oak%20St%2C%20Springfield')
  })
})
