import { Component, type ReactNode } from 'react'

/** Clear the saved copy of the app and load a fresh one */
export async function freshReload() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? []
    await Promise.all(regs.map((r) => r.unregister()))
    const names = (await caches?.keys()) ?? []
    await Promise.all(names.map((n) => caches.delete(n)))
  } catch {
    // reload anyway
  }
  window.location.reload()
}

/**
 * If a screen crashes, show what happened and a way out instead of a blank
 * page (the message helps find the problem).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 py-10">
        <h1 className="text-[26px] font-bold">Something went wrong</h1>
        <p className="text-[16px] text-muted">The app hit a problem on this screen. Your data is safe. Try one of these:</p>
        <button
          onClick={() => {
            this.setState({ error: null })
            window.location.assign('/')
          }}
          className="min-h-14 rounded-2xl bg-brand text-[17px] font-semibold text-white"
        >
          Go to Home
        </button>
        <button onClick={() => void freshReload()} className="min-h-14 rounded-2xl bg-brand-soft text-[17px] font-semibold text-brand-dark">
          Fix and reload
        </button>
        <p className="break-words rounded-xl bg-canvas px-3 py-2 font-mono text-[12px] text-muted">
          {window.location.pathname}: {error.message}
        </p>
      </div>
    )
  }
}
