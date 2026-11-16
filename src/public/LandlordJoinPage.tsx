import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { ApprovalPrefsEditor } from '../components/ApprovalPrefsEditor'
import { EmailCodeForm } from '../components/EmailCodeForm'
import { defaultApprovalPrefs } from '../data/approvalRules'
import type { ApprovalPrefs } from '../data/types'
import { CheckIcon, MessageIcon, PhoneIcon } from '../components/Icons'
import { Card, Divider, ErrorNote, Field, Loading } from '../components/ui'
import { publicApi } from '../data/backend'
import { money } from '../data/requests'
import { useAuth } from '../lib/auth'
import { phoneLink } from '../lib/links'
import { PublicShell } from './PublicShell'

/** Where the sign-up page keeps the chosen approval rules until the landlord is logged in */
export const PENDING_RULES_KEY = 'pending-approval-rules'

/** What the plan covers when the business hasn't listed its own services */
export const defaultPerks = [
  'We deal with your tenants for you',
  'You approve the work, your way, by budget',
  'Repairs, turnovers and inspections',
  'Before and after photos of every job',
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
  const [rules, setRules] = useState<ApprovalPrefs>(defaultApprovalPrefs)
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
  const perks = defaultPerks
  const whatsapp = page.whatsapp?.replace(/\D/g, '')

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto w-full max-w-lg px-4 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-[calc(env(safe-area-inset-top)+16px)]">
        {/* The ad */}
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#064e3b] via-[#047857] to-[#0f766e] px-5 pb-6 pt-5 text-white shadow-[0_16px_36px_-14px_rgba(6,78,59,0.6)]">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-[#a7f3d0]">{page.name}</p>
          <span className="mt-3 inline-block rounded-full bg-[#fbbf24] px-3 py-1 text-[13px] font-extrabold uppercase tracking-wide text-[#3b2a00]">
            Free sign-up
          </span>
          <h1 className="mt-3 text-[32px] font-extrabold leading-[1.08] tracking-tight">Maintenance plan for landlords</h1>
          <p className="mt-2 text-[17px] leading-snug text-[#d1fae5]">
            We take care of the hassle with your tenants. You just approve the work, your way.
          </p>
          <a
            href="#signup"
            className="mt-5 flex min-h-13 items-center justify-center rounded-2xl bg-white py-3.5 text-[17px] font-bold text-[#064e3b] active:scale-[0.98]"
          >
            Sign up free
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
            ['1', 'Sign up free', 'Set your approval rules'],
            ['2', 'Add your houses', 'We confirm each one'],
            ['3', 'We handle tenants', 'You approve the work'],
          ].map(([n, title, sub]) => (
            <div key={n} className="rounded-2xl bg-card px-3 py-3 ring-1 ring-black/[0.05]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#064e3b] text-[14px] font-bold text-white">{n}</span>
              <p className="mt-2 text-[15px] font-semibold leading-tight">{title}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-muted">{sub}</p>
            </div>
          ))}
        </div>

        <section id="signup" className="scroll-mt-4">
          {mode === 'login' && <h2 className="mb-2 mt-7 px-1 text-[13px] font-bold uppercase tracking-wide text-muted">Log in</h2>}
          {mode === 'signup' ? (
            <EmailCodeForm
              key="signup"
              submitLabel="Sign up free"
              landlord={() => {
                if (!name.trim()) return null
                try {
                  localStorage.setItem(PENDING_RULES_KEY, JSON.stringify(rules))
                } catch {
                  // they can set the rules after logging in
                }
                return { fullName: name.trim(), phone: phone.trim(), companySlug: slug, referral: params.get('ref') ?? '' }
              }}
              before={
                <div className="mb-4">
                  <p className="mb-2 mt-7 px-1 text-[13px] font-bold uppercase tracking-wide text-muted">Your approval rules</p>
                  <ApprovalPrefsEditor value={rules} onChange={setRules} />
                  <p className="mt-1.5 px-1 text-[13px] text-muted">You can change these any time after signing up.</p>
                  <p className="mb-2 mt-5 px-1 text-[13px] font-bold uppercase tracking-wide text-muted">Your details</p>
                </div>
              }
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
            {free ? 'Joining is free for now. ' : `Signing up is free. The plan is ${money(plan.price!)} a month per house, only once you start it on a house. `}
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
