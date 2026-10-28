/** Link that opens the phone dialer */
export function phoneLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

/**
 * Link that opens the Messages app with a text ready to send.
 * "?&body=" works on both iPhone and Android.
 */
export function smsLink(phone: string, body: string): string {
  return `sms:${phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(body)}`
}

/**
 * Directions to an address. Apple Maps links open the Maps app on iPhone
 * and automatically fall back to Google Maps on other devices.
 */
export function directionsLink(address: string): string {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(address)}`
}
