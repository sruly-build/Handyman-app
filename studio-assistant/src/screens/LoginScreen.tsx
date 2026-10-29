import { useState } from 'react'
import { supabase } from '../lib/cloud'
import { Button, Field, inputCls } from '../components/ui'

type Mode = 'login' | 'signup' | 'forgot'

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    const auth = supabase!.auth
    const res =
      mode === 'login'
        ? await auth.signInWithPassword({ email, password })
        : mode === 'signup'
          ? await auth.signUp({ email, password, options: { emailRedirectTo: location.origin } })
          : await auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/settings?reset=1` })
    setBusy(false)
    if (res.error) {
      setError(res.error.message)
      return
    }
    if (mode === 'signup' && !('session' in res.data && res.data.session)) setMessage('Check your email to confirm your account, then log in.')
    if (mode === 'forgot') setMessage('Check your email for a link to set a new password.')
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-10">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/icon.svg" alt="" className="mx-auto h-14 w-14" />
          <h1 className="mt-4 text-[28px] font-bold tracking-tight">Studio Assistant</h1>
          <p className="mt-1 text-ink-2">{mode === 'signup' ? 'Create your studio account' : mode === 'forgot' ? 'Reset your password' : 'Log in to your studio'}</p>
        </div>
        <div className="space-y-4">
          <Field label="Email">
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </Field>
          {mode !== 'forgot' && (
            <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters' : undefined}>
              <input
                type="password"
                required
                minLength={mode === 'signup' ? 8 : undefined}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
              />
            </Field>
          )}
          {error && <p className="rounded-xl bg-red-soft px-3.5 py-2.5 text-[14px] text-red">{error}</p>}
          {message && <p className="rounded-xl bg-green-soft px-3.5 py-2.5 text-[14px] text-green">{message}</p>}
          <Button variant="primary" size="lg" type="submit" disabled={busy}>
            {busy ? 'One moment…' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Log in'}
          </Button>
        </div>
        <div className="mt-6 flex flex-col items-center gap-2 text-[15px]">
          {mode === 'login' ? (
            <>
              <button type="button" onClick={() => setMode('forgot')} className="text-accent">
                Forgot password?
              </button>
              <button type="button" onClick={() => setMode('signup')} className="text-ink-2">
                First time? <span className="text-accent">Create your account</span>
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setMode('login')} className="text-accent">
              Back to log in
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
