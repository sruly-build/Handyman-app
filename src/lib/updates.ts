import { registerSW } from 'virtual:pwa-register'

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
      const check = () => {
        if (navigator.onLine) void registration.update().catch(() => {})
      }
      setInterval(check, 30 * 60 * 1000)
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
    },
  })
}
