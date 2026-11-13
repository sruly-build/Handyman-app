import { backend } from '../data/backend'

/**
 * Emergency alerts on this phone (web push). On Android, add the app to the
 * home screen first (Chrome menu → Add to Home screen / Install app) so alerts
 * arrive even when the app is closed.
 */
const PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() ?? ''

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && Boolean(PUBLIC_KEY)

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registration() {
  return navigator.serviceWorker.ready
}

/** Are alerts on for this phone right now? */
export async function alertsOn(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  const sub = await (await registration()).pushManager.getSubscription()
  return Boolean(sub)
}

export async function turnAlertsOn(): Promise<void> {
  if (!pushSupported()) throw new Error("This phone or browser can't get alerts. On Android, use Chrome and add the app to your home screen.")
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Alerts are blocked. Allow notifications for this app in your phone settings, then try again.')
  const reg = await registration()
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) }))
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  await backend.savePushSubscription({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth })
}

export async function turnAlertsOff(): Promise<void> {
  if (!pushSupported()) return
  const sub = await (await registration()).pushManager.getSubscription()
  if (!sub) return
  await backend.removePushSubscription(sub.endpoint)
  await sub.unsubscribe()
}
