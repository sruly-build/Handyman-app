import { useState, type FormEvent } from 'react'
import { backend } from '../data/backend'
import { Button, Card, Divider, ErrorNote, Field } from '../components/ui'

export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const demo = backend.mode === 'demo'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await backend.signIn(email.trim(), password)
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <div className="animate-fade-in mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <img src="/icon.svg" alt="" className="mx-auto h-24 w-24 rounded-[22px] shadow-lg" />
      <h1 className="mt-6 text-center text-[34px] font-bold tracking-tight">Handyman</h1>
      <p className="mb-8 text-center text-[17px] text-muted">Log in to see your jobs</p>

      <form onSubmit={submit} className="space-y-4">
        <Card>
          <Field
            label="Email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <Divider />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            required={!demo}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={demo ? 'Any password works in Demo mode' : '••••••••'}
          />
        </Card>
        {Boolean(error) && <ErrorNote error={error} />}
        <Button type="submit" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </Button>
      </form>

      {demo && (
        <p className="mt-6 rounded-2xl bg-progress-soft px-4 py-3 text-center text-[14px] text-[#9a5300]">
          <strong>Demo mode.</strong> Supabase isn't connected yet, so everything is saved on this device only. Type any
          email to try the app.
        </p>
      )}
    </div>
  )
}
