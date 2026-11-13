import webpush from 'web-push'
import { admin, env } from './server.js'

export interface Alert {
  title: string
  body: string
  url: string
  tag?: string
}

const PUBLIC_KEY = 'BHmV5MK5gpkp_ShgW2hP5Wh1axfLcVW4HEcFR1aPCrQWVHaHGEBsvGjqf3nGJJw4nBRJa9jFwgL2rLCYUOOEcJY'

/** Is web push set up (the private key is in Vercel's settings)? */
export const pushReady = () => Boolean(env('VAPID_PRIVATE_KEY'))

/**
 * Send an alert to every phone that turned on alerts for this company (or
 * just one person). Phones whose alerts were switched off are removed.
 * Returns how many phones got it.
 */
export async function alertCompany(companyId: string, alert: Alert, onlyUser?: string): Promise<number> {
  if (!pushReady()) return 0
  webpush.setVapidDetails(
    env('VAPID_SUBJECT') || 'mailto:alerts@example.com',
    env('VAPID_PUBLIC_KEY') || PUBLIC_KEY,
    env('VAPID_PRIVATE_KEY'),
  )
  const db = admin()
  let q = db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('company_id', companyId)
  if (onlyUser) q = q.eq('user_id', onlyUser)
  const { data: subs } = await q
  let sent = 0
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(alert),
        { TTL: 60 * 60, urgency: 'high' },
      )
      sent++
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      // 404/410: that phone turned alerts off or the app was removed
      if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('id', s.id)
    }
  }
  return sent
}
