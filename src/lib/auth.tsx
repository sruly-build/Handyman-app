import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { backend } from '../data/backend'
import type { AppUser } from '../data/types'

interface AuthState {
  user: AppUser | null
  loading: boolean
  /** True after opening a "reset password" link, until a new password is saved */
  recovering: boolean
  finishRecovery: () => void
}

const AuthContext = createContext<AuthState>({ user: null, loading: true, recovering: false, finishRecovery: () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ user: AppUser | null; loading: boolean }>({ user: null, loading: true })
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    let active = true
    backend
      .getUser()
      .then((user) => active && setState({ user, loading: false }))
      .catch(() => active && setState({ user: null, loading: false }))
    const unsubscribe = backend.onAuthChange((user) => active && setState({ user, loading: false }))
    const stopRecovery = backend.onPasswordRecovery(() => active && setRecovering(true))
    return () => {
      active = false
      unsubscribe()
      stopRecovery()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, recovering, finishRecovery: () => setRecovering(false) }}>
      {children}
    </AuthContext.Provider>
  )
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
