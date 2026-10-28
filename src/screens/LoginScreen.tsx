import { useState, type FormEvent } from 'react'
import { backend } from '../data/backend'
import type { SignupStatus } from '../data/types'
import { Button, Card, Divider, ErrorNote, Field, Segmented } from '../components/ui'

type Mode = 'login' | 'signup' | 'forgot'

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  // Sign-up is by approval: first check the email, then ask for the rest
  const [approvedAs, setApprovedAs] = useState<Exclude<SignupStatus, 'exists' | 'none'> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [message, setMessage] = useState<string | null>(null)
  const demo = backend.mode === 'demo'

  function switchTo(next: Mode) {
    setMode(next)
    setApprovedAs(null)
    setError(null)
    setMessage(null)
  }

  async function checkEmail() {
    const status = await backend.signupStatus(email)
    if (status === 'none') {
      throw new Error(
        "This email hasn't been approved to sign up yet. Ask the app's admin (or, to join a team, your boss) to approve it first.",
      )
    }
    if (status === 'exists') {
      throw new Error('This email already has an account. Log in, or tap Forgot password to choose a new one.')
    }
    setApprovedAs(status)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      if (mode === 'login') {
        await backend.signIn(email.trim(), password)
        return // the app switches to the Home screen
      }
      if (mode === 'signup' && !approvedAs) {
        await checkEmail()
      } else if (mode === 'signup') {
        const { needsConfirmation } = await backend.signUp({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          companyName: companyName.trim(),
        })
        if (needsConfirmation) {
          setMessage(`Almost done! We sent a link to ${email.trim()}. Open it to confirm your email, then log in here.`)
          setMode('login')
          setApprovedAs(null)
          setPassword('')
        }
      } else {
        await backend.sendPasswordReset(email.trim())
        setMessage(`If ${email.trim()} has an account, we sent it a link to choose a new password. Check your spam folder too.`)
      }
    } catch (err) {
      setError(err)
    }
    setBusy(false)
  }

  const title = { login: 'Log in to see your jobs', signup: 'Create your account', forgot: 'Reset your password' }[mode]
  const signupDetails = mode === 'signup' && approvedAs !== null
  const buttonLabel =
    mode === 'login'
      ? 'Log in'
      : mode === 'forgot'
        ? 'Send reset link'
        : signupDetails
          ? 'Create account'
          : 'Continue'

  return (
    <div className="animate-fade-in mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))]">
      <img src="/icon.svg" alt="" className="mx-auto h-20 w-20 rounded-[20px] shadow-lg" />
      <h1 className="mt-5 text-center text-[34px] font-bold tracking-tight">Handyman</h1>
      <p className="mb-6 text-center text-[17px] text-muted">{title}</p>

      {mode !== 'forgot' && (
        <div className="mb-4">
          <Segmented
            label="Log in or sign up"
            value={mode}
            onChange={switchTo}
            options={[
              { value: 'login', label: 'Log in' },
              { value: 'signup', label: 'Sign up' },
            ]}
          />
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <Card>
          <Field
            label="Email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            required
            readOnly={signupDetails}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          {signupDetails && approvedAs === 'company' && (
            <>
              <Divider />
              <Field
                label="Business name"
                required
                autoComplete="organization"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Dave's Handyman Service"
              />
            </>
          )}
          {signupDetails && (
            <>
              <Divider />
              <Field
                label="Your name"
                required
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Dave"
              />
            </>
          )}
          {(mode === 'login' || signupDetails) && (
            <>
              <Divider />
              <Field
                label={signupDetails ? 'Choose a password' : 'Password'}
                type="password"
                autoComplete={signupDetails ? 'new-password' : 'current-password'}
                required={!demo}
                minLength={signupDetails && !demo ? 6 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={demo ? 'Any password works in Demo mode' : signupDetails ? 'At least 6 characters' : '••••••••'}
              />
            </>
          )}
        </Card>

        {mode === 'signup' && !approvedAs && (
          <p className="px-2 text-[13px] text-muted">
            Sign-up is by invitation. Enter the email you were approved with.
          </p>
        )}
        {signupDetails && (
          <p className="rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-dark">
            {approvedAs === 'team'
              ? "You're approved to join a team. Choose your name and password to finish."
              : "You're approved. Set up your business and choose a password."}{' '}
            <button
              type="button"
              onClick={() => setApprovedAs(null)}
              className="font-semibold underline underline-offset-2"
            >
              Change email
            </button>
          </p>
        )}

        {Boolean(error) && <ErrorNote error={error} />}
        {message && (
          <p className="rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-dark" role="status">
            {message}
          </p>
        )}

        <Button type="submit" disabled={busy}>
          {busy ? 'Please wait…' : buttonLabel}
        </Button>
      </form>

      <div className="mt-3 text-center">
        {mode === 'login' && (
          <button onClick={() => switchTo('forgot')} className="min-h-11 px-3 text-[15px] font-medium text-brand active:opacity-50">
            Forgot password?
          </button>
        )}
        {mode === 'forgot' && (
          <button onClick={() => switchTo('login')} className="min-h-11 px-3 text-[15px] font-medium text-brand active:opacity-50">
            Back to log in
          </button>
        )}
      </div>

      {demo && (
        <p className="mt-4 rounded-2xl bg-progress-soft px-4 py-3 text-center text-[14px] text-[#9a5300]">
          <strong>Demo mode.</strong> Supabase isn't connected yet, so everything is saved on this device only. Type any
          email to try the app.
        </p>
      )}
    </div>
  )
}
