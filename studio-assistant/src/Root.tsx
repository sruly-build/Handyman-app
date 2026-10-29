import { useEffect, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { StoreProvider, loadPreview } from './data/store'
import { isLive, loadAll, supabase } from './lib/cloud'
import type { State } from './data/types'
import { LoginScreen } from './screens/LoginScreen'
import { ClientGalleryScreen } from './screens/ClientGalleryScreen'
import { PayScreen } from './screens/PayScreen'
import App from './App'

/**
 * Client links (/g/... galleries, /pay/... invoices) open without a login.
 * Everything else needs the owner to be logged in when the app is live.
 */
export function Root() {
  const { pathname } = useLocation()
  const isPublic = /^\/(g|pay)\//.test(pathname)

  if (!isLive) {
    return (
      <StoreProvider initial={loadPreview()}>
        <App />
      </StoreProvider>
    )
  }
  if (isPublic) {
    return (
      <Routes>
        <Route path="/g/:id" element={<ClientGalleryScreen />} />
        <Route path="/pay/:id" element={<PayScreen />} />
      </Routes>
    )
  }
  return <LiveApp />
}

function LiveApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase!.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase!.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) {
      setState(null)
      return
    }
    setError('')
    loadAll()
      .then(setState)
      .catch(() => setError('Couldn’t load your studio. Check your connection and try again.'))
  }, [userId])

  if (session === undefined) return <Splash />
  if (!session) return <LoginScreen />
  if (error)
    return (
      <Splash>
        <p className="max-w-xs text-center text-[15px] text-ink-2">{error}</p>
        <button onClick={() => location.reload()} className="mt-4 h-11 rounded-full bg-accent px-6 font-semibold text-white">
          Try again
        </button>
      </Splash>
    )
  if (!state) return <Splash />
  return (
    <StoreProvider key={userId} initial={state}>
      <App />
    </StoreProvider>
  )
}

function Splash({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6">
      {children ?? <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-accent" aria-label="Loading" />}
    </div>
  )
}
