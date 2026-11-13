import { useState, type FormEvent, type ReactNode } from 'react'
import { backend } from '../data/backend'
import type { LandlordSignUp } from '../data/db'
import { Button, Card, ErrorNote, Field } from './ui'

/**
 * Log in with a 6-digit code sent by email (no password). With `landlord`
 * details it creates a landlord account the first time.
 */
export function EmailCodeForm({
  landlord,
  children,
  submitLabel = 'Email me a code',
}: {
  landlord?: (email: string) => LandlordSignUp | null
  /** Extra fields shown before the code is sent (e.g. name and phone) */
  children?: ReactNode
  submitLabel?: string
}) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const demo = backend.mode === 'demo'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (!sent) {
        const details = landlord ? landlord(email.trim()) : undefined
        if (landlord && !details) throw new Error('Please fill in your name.')
        await backend.sendCode(email.trim(), details ?? undefined)
        setSent(true)
      } else {
        await backend.verifyCode(email.trim(), code)
        return // the app switches screens
      }
    } catch (err) {
      setError(err)
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          required
          readOnly={sent}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        {!sent && children}
        {sent && (
          <Field
            label="6-digit code from the email"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="border-t border-hairline"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder={demo ? 'Any 6 digits in Demo mode' : '123456'}
          />
        )}
      </Card>
      {sent && (
        <p className="rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-dark" role="status">
          We emailed a code to {email.trim()}. Check your spam folder too.{' '}
          <button type="button" className="font-semibold underline" onClick={() => { setSent(false); setCode('') }}>
            Change email
          </button>
        </p>
      )}
      {Boolean(error) && <ErrorNote error={error} />}
      <Button type="submit" disabled={busy || (sent && code.length !== 6)}>
        {busy ? 'Please wait…' : sent ? 'Log in' : submitLabel}
      </Button>
    </form>
  )
}
