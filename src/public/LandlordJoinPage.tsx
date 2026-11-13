import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { EmailCodeForm } from '../components/EmailCodeForm'
import { Card, Divider, ErrorNote, Field, Loading, Segmented } from '../components/ui'
import { publicApi } from '../data/backend'
import { money } from '../data/requests'
import { useAuth } from '../lib/auth'
import { PublicShell } from './PublicShell'

/** /l/<company>: landlords sign up or log in with an email code (no password) */
export function LandlordJoinPage() {
  const { slug = '' } = useParams()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const [mode, setMode] = useState<'signup' | 'login'>(params.get('ref') ? 'signup' : 'signup')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const { data: page, isLoading, error } = useQuery({ queryKey: ['public-page', slug], queryFn: () => publicApi.page(slug), retry: false })

  if (user?.role === 'landlord') return <Navigate to="/landlord" replace />
  if (isLoading) return <PublicShell title="Landlords" lang="en"><Loading /></PublicShell>
  if (error || !page) {
    return (
      <PublicShell title="Landlords" lang="en">
        {error ? <ErrorNote error={error} /> : <p className="text-[17px]">This page doesn't exist. Please check the link.</p>}
      </PublicShell>
    )
  }
  if (user) {
    return (
      <PublicShell title="Landlords" company={page.name} lang="en">
        <p className="text-[17px]">You're logged in to the business app. Log out first to try the landlord login.</p>
      </PublicShell>
    )
  }
  const plan = page.plan
  return (
    <PublicShell title="Landlord Maintenance Plan" company={page.name} lang="en">
      {plan && plan.price != null && (
        <Card className="px-4 py-4">
          <p className="text-[28px] font-bold leading-tight">
            {money(plan.price)}
            <span className="text-[17px] font-semibold text-muted"> / month per house</span>
          </p>
          <ul className="mt-2 space-y-1 text-[16px]">
            {plan.services.map((s) => (
              <li key={s}>✓ {s}</li>
            ))}
          </ul>
          <p className="mt-3 text-[14px] text-muted">
            {plan.hours} hour{plan.hours === 1 ? '' : 's'} added every {plan.every_months} months while the plan is paid. Each visit uses one full hour.
            Unused hours roll over (up to {plan.cap}) and each hour expires {plan.expire_months} months after it's added. Parts are extra, with your
            approval. Monthly only; cancel any time.
            {page.emergency_fee > 0 ? ` Emergency visits have a ${money(page.emergency_fee)} emergency charge.` : ''}
          </p>
        </Card>
      )}
      <div className="mt-5 mb-4">
        <Segmented
          label="Sign up or log in"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'signup', label: 'New here' },
            { value: 'login', label: 'I have an account' },
          ]}
        />
      </div>
      {mode === 'signup' ? (
        <EmailCodeForm
          key="signup"
          submitLabel="Create my account"
          landlord={() => (name.trim() ? { fullName: name.trim(), phone: phone.trim(), companySlug: slug, referral: params.get('ref') ?? '' } : null)}
        >
          <Divider />
          <Field label="Your name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          <Divider />
          <Field label="Phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </EmailCodeForm>
      ) : (
        <EmailCodeForm key="login" />
      )}
      <p className="mt-3 px-1 text-[13px] text-muted">
        Signing up is free. You pay only when you start the plan on a house. You'll see only your own houses, after they're approved.
      </p>
    </PublicShell>
  )
}
