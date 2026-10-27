/** Link that opens the phone dialer */
export function phoneLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

/**
 * Directions to an address. Apple Maps links open the Maps app on iPhone
 * and automatically fall back to Google Maps on other devices.
 */
export function directionsLink(address: string): string {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(address)}`
}
