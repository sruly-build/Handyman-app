import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { EmailCodeForm } from '../components/EmailCodeForm'
import { CheckIcon, MessageIcon, PhoneIcon } from '../components/Icons'
import { Card, Divider, ErrorNote, Field, Loading } from '../components/ui'
import { publicApi } from '../data/backend'
import { money } from '../data/requests'
import { useAuth } from '../lib/auth'
import { phoneLink } from '../lib/links'
import { PublicShell } from './PublicShell'

/** What the plan covers when the business hasn't listed its own services */
export const defaultPerks = [
  'Repairs and small jobs, one text away',
  'Turnovers between tenants',
  'Regular inspections and filter changes',
  'Before and after photos of every job',
  'Parts only with your OK',
]

/**
 * /l/<company>: the landlord sign-up page, laid out like a small ad (what you
 * get, how it works, then the form). Landlords sign up or log in with an
 * email code (no password). Shows "Free to join" while the plan has no price.
 */
export function LandlordJoinPage() {
  const { slug = '' } = useParams()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const { data: page, isLoading, error } = useQuery({ queryKey: ['public-page', slug], queryFn: () => publicApi.page(slug), retry: false })
  useEffect(() => {
    document.title = page?.name ? `${page.name} · Maintenance plan for landlords` : 'Maintenance plan for landlords'
  }, [page?.name])

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
  const free = !plan?.price
  const perks = plan?.services?.length ? plan.services : defaultPerks
  const whatsapp = page.whatsapp?.replace(/\D/g, '')

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto w-full max-w-lg px-4 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-[calc(env(safe-area-inset-top)+16px)]">
        {/* The ad */}
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#064e3b] via-[#047857] to-[#0f766e] px-5 pb-6 pt-5 text-white shadow-[0_16px_36px_-14px_rgba(6,78,59,0.6)]">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-[#a7f3d0]">{page.name}</p>
          <span className="mt-3 inline-block rounded-full bg-[#fbbf24] px-3 py-1 text-[13px] font-extrabold uppercase tracking-wide text-[#3b2a00]">
            {free ? 'Free to join' : `${money(plan!.price!)} / month per house`}
          </span>
          <h1 className="mt-3 text-[32px] font-extrabold leading-[1.08] tracking-tight">Maintenance plan for landlords</h1>
          <p className="mt-2 text-[17px] leading-snug text-[#d1fae5]">One text and it's handled: repairs, turnovers and inspections for your rentals.</p>
          <a
            href="#signup"
            className="mt-5 flex min-h-13 items-center justify-center rounded-2xl bg-white py-3.5 text-[17px] font-bold text-[#064e3b] active:scale-[0.98]"
          >
            {free ? 'Sign up free' : 'Sign up'}
          </a>
        </section>

        <h2 className="mb-2 mt-7 px-1 text-[13px] font-bold uppercase tracking-wide text-muted">What you get</h2>
        <Card className="px-4 py-2">
          {perks.map((p, i) => (
            <div key={p} className={`flex items-start gap-3 py-2.5 ${i ? 'border-t border-hairline' : ''}`}>
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-dark">
                <CheckIcon size={15} strokeWidth={3} />
              </span>
              <span className="text-[16px] leading-snug">{p}</span>
            </div>
          ))}
        </Card>

        <h2 className="mb-2 mt-7 px-1 text-[13px] font-bold uppercase tracking-wide text-muted">How it works</h2>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['1', free ? 'Sign up free' : 'Sign up', 'Takes a minute'],
            ['2', 'Add your houses', 'We confirm each one'],
            ['3', 'Text us', 'When something needs fixing'],
          ].map(([n, title, sub]) => (
            <div key={n} className="rounded-2xl bg-card px-3 py-3 ring-1 ring-black/[0.05]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#064e3b] text-[14px] font-bold text-white">{n}</span>
              <p className="mt-2 text-[15px] font-semibold leading-tight">{title}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-muted">{sub}</p>
            </div>
          ))}
        </div>

        <section id="signup" className="scroll-mt-4">
          <h2 className="mb-2 mt-7 px-1 text-[13px] font-bold uppercase tracking-wide text-muted">
            {mode === 'signup' ? 'Create your account' : 'Log in'}
          </h2>
          {mode === 'signup' ? (
            <EmailCodeForm
              key="signup"
              submitLabel={free ? 'Sign up free' : 'Create my account'}
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
          <button
            type="button"
            onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
            className="mt-2 min-h-11 w-full text-[15px] font-semibold text-brand active:opacity-60"
          >
            {mode === 'signup' ? 'Already signed up? Log in' : 'New here? Sign up'}
          </button>
        </section>

        {plan && (
          <p className="mt-4 px-1 text-[13px] leading-snug text-muted">
            {free ? 'Joining is free for now. ' : ''}
            {plan.hours} hour{plan.hours === 1 ? '' : 's'} of work added every {plan.every_months} months
            {free ? '' : ' while the plan is paid'}. Each visit uses one full hour. Unused hours roll over (up to {plan.cap}) and each hour expires{' '}
            {plan.expire_months} months after it's added. Parts are extra, with your approval.{free ? '' : ' Monthly only; cancel any time.'}
            {page.emergency_fee > 0 ? ` Emergency visits have a ${money(page.emergency_fee)} emergency charge.` : ''}
          </p>
        )}
        <p className="mt-2 px-1 text-[13px] text-muted">You'll see only your own houses, after they're confirmed.</p>

        {(page.phone || whatsapp) && (
          <div className="mt-6 grid grid-cols-2 gap-2">
            {page.phone && (
              <a href={phoneLink(page.phone)} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-card text-[15px] font-semibold ring-1 ring-black/[0.05]">
                <PhoneIcon size={18} className="text-brand" /> Call
              </a>
            )}
            {whatsapp && (
              <a
                href={`https://wa.me/${whatsapp}`}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-card text-[15px] font-semibold ring-1 ring-black/[0.05]"
              >
                <MessageIcon size={18} className="text-brand" /> WhatsApp
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
