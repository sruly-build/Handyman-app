import { describe, expect, it } from 'vitest'
import { directionsLink, smsLink, whatsappLink } from './links'

describe('message links', () => {
  it('texts the number with the message', () => {
    expect(smsLink('(555) 123-4567', 'On my way')).toBe('sms:5551234567?&body=On%20my%20way')
  })
  it('adds +1 for WhatsApp when there is no country code', () => {
    expect(whatsappLink('(555) 123-4567', 'Hi')).toBe('https://wa.me/15551234567?text=Hi')
    expect(whatsappLink('1-555-123-4567', 'Hi')).toBe('https://wa.me/15551234567?text=Hi')
  })
  it('keeps a country code that was typed in', () => {
    expect(whatsappLink('+44 7700 900123', 'Hi')).toBe('https://wa.me/447700900123?text=Hi')
    expect(whatsappLink('+972 50 123 4567', 'Hi')).toBe('https://wa.me/972501234567?text=Hi')
  })
})

describe('directions', () => {
  it('opens Google Maps driving directions', () => {
    expect(directionsLink('120 Clifton Ave, Lakewood, NJ')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=120%20Clifton%20Ave%2C%20Lakewood%2C%20NJ&travelmode=driving',
    )
  })
})
