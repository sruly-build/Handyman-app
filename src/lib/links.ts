/** Link that opens the phone dialer */
export function phoneLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

/** Link that opens the Messages app to text this number */
export function textLink(phone: string): string {
  return `sms:${phone.replace(/[^\d+]/g, '')}`
}

/**
 * Link that opens the Messages app with a text ready to send.
 * "?&body=" works on both iPhone and Android.
 */
export function smsLink(phone: string, body: string): string {
  return `sms:${phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(body)}`
}

/**
 * Link that opens WhatsApp with a message ready to send. WhatsApp needs the
 * country code: numbers typed without one are taken as US/Canada (+1).
 */
export function whatsappLink(phone: string, body: string): string {
  let digits = phone.replace(/\D/g, '')
  if (!phone.trim().startsWith('+') && digits.length === 10) digits = `1${digits}`
  return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`
}

/**
 * Driving directions to an address in Google Maps. On a phone with the
 * Google Maps app this opens the app; otherwise Google Maps in the browser.
 */
export function directionsLink(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`
}
