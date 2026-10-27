import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { backend } from '../data/backend'
import type { AppUser } from '../data/types'

interface AuthState {
  user: AppUser | null
  loading: boolean
}

const AuthContext = createContext<AuthState>({ user: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })

  useEffect(() => {
    let active = true
    backend
      .getUser()
      .then((user) => active && setState({ user, loading: false }))
      .catch(() => active && setState({ user: null, loading: false }))
    const unsubscribe = backend.onAuthChange((user) => active && setState({ user, loading: false }))
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

/** For screens that only show once someone is logged in */
export function useUser(): AppUser {
  const { user } = useAuth()
  if (!user) throw new Error('useUser called while logged out')
  return user
}
