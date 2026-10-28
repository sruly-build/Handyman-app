import { useState, type FormEvent } from 'react'
import { Button, Card, Divider, ErrorNote, Field } from '../components/ui'
import { backend } from '../data/backend'

/** Shown after opening a "reset password" link from an email */
export function SetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password !== again) {
      setError(new Error("The two passwords don't match."))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await backend.updatePassword(password)
      onDone()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <div className="animate-fade-in mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <h1 className="text-center text-[34px] font-bold tracking-tight">New password</h1>
      <p className="mb-6 text-center text-[17px] text-muted">Choose a new password for your account.</p>
      <form onSubmit={submit} className="space-y-4">
        <Card>
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
          <Divider />
          <Field
            label="Type it again"
            type="password"
            autoComplete="new-password"
            required
            value={again}
            onChange={(e) => setAgain(e.target.value)}
          />
        </Card>
        {Boolean(error) && <ErrorNote error={error} />}
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save new password'}
        </Button>
      </form>
    </div>
  )
}
