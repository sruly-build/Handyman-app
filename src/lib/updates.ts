import { registerSW } from 'virtual:pwa-register'

declare const __BUILD_TIME__: string

/** When the version on this phone was built, e.g. "Nov 15, 1:35 PM" */
export const buildLabel = () => {
  try {
    return new Date(__BUILD_TIME__).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

let swRegistration: ServiceWorkerRegistration | undefined

/**
 * Ask the server for a newer version now. Returns true when one was found
 * (the page then reloads by itself once it's installed).
 */
export async function checkForUpdate(): Promise<boolean> {
  const reg = swRegistration ?? (await navigator.serviceWorker?.getRegistration())
  if (!reg) {
    window.location.reload()
    return false
  }
  await reg.update()
  if (reg.installing || reg.waiting) {
    reg.waiting?.postMessage({ type: 'SKIP_WAITING' })
    return true
  }
  return false
}

/**
 * Keep the installed app up to date. The browser normally only checks for a
 * new version when the app is first opened, so a tab left open (or a home
 * screen app that's never fully closed) could stay on an old version. Check
 * whenever the app comes back to the screen and every 30 minutes; a new
 * version then installs and the page reloads by itself.
 */
export function keepAppUpdated() {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      swRegistration = registration
      const check = () => {
        if (navigator.onLine) void registration.update().catch(() => {})
      }
      setInterval(check, 30 * 60 * 1000)
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
    },
  })
}
