import { useMutation, useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PrintIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, GroupLabel, Loading, TextArea, Toggle } from '../components/ui'
import { backend } from '../data/backend'
import { refreshAll, useServiceSettings } from '../data/queries'
import { cleanSlug, defaultSeasonal, defaultTurnoverChecklist } from '../data/requests'
import type { PlanTier, ServiceSettings } from '../data/types'
import { useUser } from '../lib/auth'

export const requestPageLink = (slug: string | null | undefined) =>
  slug ? `${window.location.origin}/r/${slug}` : ''

/** A QR code picture (data URL) for a link */
export function useQr(link: string, size = 480) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    if (!link) return setSrc('')
    let live = true
    void QRCode.toDataURL(link, { width: size, margin: 1, errorCorrectionLevel: 'M' }).then((url) => live && setSrc(url))
    return () => {
      live = false
    }
  }, [link, size])
  return src
}

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/[^0-9.]/g, '')))
const lines = (v: string) => v.split('\n').map((l) => l.trim()).filter(Boolean)

/** Me → Request page & plan: the link and QR code, and every adjustable setting */
export function RequestSettingsScreen() {
  const user = useUser()
  const owner = user.role === 'owner'
  const { data, isLoading, error } = useServiceSettings()
  const [form, setForm] = useState<ServiceSettings | null>(null)
  const [copied, setCopied] = useState(false)
  const qc = useQueryClient()
  useEffect(() => {
    if (data && !form) setForm(data)
  }, [data, form])

  const save = useMutation({
    mutationFn: (f: ServiceSettings) => backend.saveServiceSettings(f),
    onSuccess: (saved) => {
      setForm(saved)
      void refreshAll(qc)
    },
  })

  const link = requestPageLink(data?.public_slug)
  const qr = useQr(link)

  if (isLoading || !form) {
    return (
      <Screen title="Request page" back={{ to: '/more', label: 'Me' }}>
        {error ? <ErrorNote error={error} /> : <Loading />}
      </Screen>
    )
  }
  const set = (patch: Partial<ServiceSettings>) => {
    setForm({ ...form, ...patch })
    save.reset()
  }
  const setTier = (i: number, patch: Partial<PlanTier>) =>
    set({ plan_tiers: form.plan_tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) })
  const numberField = (label: string, key: keyof ServiceSettings, hint?: string) => (
    <Field
      label={hint ? `${label} (${hint})` : label}
      inputMode="decimal"
      disabled={!owner}
      value={String(form[key] ?? '')}
      onChange={(e) => set({ [key]: num(e.target.value) ?? 0 } as Partial<ServiceSettings>)}
    />
  )

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this link:', link)
    }
  }

  return (
    <Screen title="Request page" back={{ to: '/more', label: 'Me' }}>
      <p className="-mt-3 mb-5 px-1 text-[15px] text-muted">
        Tenants and landlords send repair requests here. No login needed. Requests land in your Requests inbox.
      </p>

      {link ? (
        <Card className="px-4 py-4">
          <p className="text-[13px] font-medium text-muted">Your request page</p>
          <a href={link} target="_blank" rel="noreferrer" className="block break-all text-[17px] font-semibold text-brand">
            {link}
          </a>
          {qr && <img src={qr} alt="QR code for the request page" className="mx-auto mt-3 h-48 w-48" />}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button onClick={() => void copy()} className="min-h-11 rounded-xl bg-brand-soft text-[15px] font-semibold text-brand-dark">
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={() => void navigator.share?.({ title: 'Request a repair', url: link }).catch(() => {})}
              className="min-h-11 rounded-xl bg-brand-soft text-[15px] font-semibold text-brand-dark disabled:opacity-40"
              disabled={typeof navigator.share !== 'function'}
            >
              Share
            </button>
            <Link to="/request-page/poster" className="flex min-h-11 items-center justify-center gap-1 rounded-xl bg-brand-soft text-[15px] font-semibold text-brand-dark">
              <PrintIcon size={18} /> Print QR
            </Link>
          </div>
        </Card>
      ) : (
        <p className="px-1 text-[15px] text-muted">Pick a page address below and save to get your link.</p>
      )}

      <form
        className="mt-6 space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate({
            ...form,
            plan_tiers: form.plan_tiers.map((t) => ({ ...t, services: lines(t.services.join('\n')) })),
            addons: form.addons.filter((a) => a.name.trim()),
            turnover_checklist: lines(form.turnover_checklist.join('\n')),
            seasonal_checklists: {
              winter: lines(form.seasonal_checklists.winter.join('\n')),
              spring: lines(form.seasonal_checklists.spring.join('\n')),
            },
          })
        }}
      >
        <section>
          <GroupLabel>Page</GroupLabel>
          <Card>
            <Field
              label={`Page address (${window.location.host}/r/…)`}
              disabled={!owner}
              value={form.public_slug ?? ''}
              onChange={(e) => set({ public_slug: cleanSlug(e.target.value) })}
              autoCapitalize="none"
            />
            <Divider />
            <Field
              label="“Call now” number for emergencies (empty = business phone)"
              type="tel"
              disabled={!owner}
              value={form.emergency_phone}
              onChange={(e) => set({ emergency_phone: e.target.value })}
            />
            <Divider />
            <Field
              label="WhatsApp number for video calls"
              type="tel"
              disabled={!owner}
              value={form.whatsapp}
              onChange={(e) => set({ whatsapp: e.target.value })}
            />
            <Divider />
            <Field
              label="Google review link (for happy customers)"
              type="url"
              disabled={!owner}
              value={form.review_url}
              onChange={(e) => set({ review_url: e.target.value })}
              placeholder="https://g.page/r/…"
            />
          </Card>
        </section>

        <section>
          <GroupLabel>Rules</GroupLabel>
          <Card>
            {numberField('Emergency charge ($)', 'emergency_fee', 'shown on the Emergency choice')}
            <Divider />
            {numberField('Filter reminder every', 'filter_months', 'months; each house can change it')}
            <Divider />
            {numberField('Repeat issue after', 'repeat_threshold', 'times in 12 months')}
            <Divider />
            {numberField('Nearby “Whenever” requests within', 'nearby_miles', 'miles')}
            <Divider />
            {numberField('Parts auto-approve up to ($)', 'parts_auto_approve', 'default for new landlords')}
          </Card>
        </section>

        <section>
          <GroupLabel>Plan tiers</GroupLabel>
          <div className="space-y-3">
            {form.plan_tiers.map((tier, i) => (
              <Card key={tier.id}>
                <Field label="Name" disabled={!owner} value={tier.name} onChange={(e) => setTier(i, { name: e.target.value })} />
                <Divider />
                <div className="grid grid-cols-2">
                  <Field
                    label="Price per house / month ($)"
                    inputMode="decimal"
                    disabled={!owner}
                    value={tier.price ?? ''}
                    placeholder="Not set"
                    onChange={(e) => setTier(i, { price: num(e.target.value) })}
                  />
                  <Field
                    label="Hours added"
                    inputMode="numeric"
                    disabled={!owner}
                    className="border-l border-hairline"
                    value={tier.hours}
                    onChange={(e) => setTier(i, { hours: num(e.target.value) ?? 1 })}
                  />
                </div>
                <Divider />
                <div className="grid grid-cols-3">
                  <Field label="Every (months)" inputMode="numeric" disabled={!owner} value={tier.every_months} onChange={(e) => setTier(i, { every_months: num(e.target.value) ?? 2 })} />
                  <Field label="Bank cap (hours)" inputMode="numeric" disabled={!owner} className="border-l border-hairline" value={tier.cap} onChange={(e) => setTier(i, { cap: num(e.target.value) ?? 6 })} />
                  <Field label="Hour expires (months)" inputMode="numeric" disabled={!owner} className="border-l border-hairline" value={tier.expire_months} onChange={(e) => setTier(i, { expire_months: num(e.target.value) ?? 12 })} />
                </div>
                <Divider />
                <TextArea
                  label="Included services (one per line)"
                  rows={4}
                  disabled={!owner}
                  value={tier.services.join('\n')}
                  onChange={(e) => setTier(i, { services: e.target.value.split('\n') })}
                />
                <Divider />
                <Toggle
                  label="Offered"
                  hint={i === form.plan_tiers.findIndex((t) => t.active) ? 'This is the plan shown to landlords' : undefined}
                  checked={tier.active}
                  onChange={(active) => owner && setTier(i, { active })}
                />
              </Card>
            ))}
          </div>
          <p className="mt-1.5 px-4 text-[13px] text-muted">
            A change applies to plans started after it. Plans already running keep their terms.
          </p>
        </section>

        <section>
          <GroupLabel>Paid add-ons</GroupLabel>
          <Card>
            <TextArea
              label="One per line: name – price"
              rows={3}
              disabled={!owner}
              placeholder={'Dryer vent cleaning – 89\nGutter cleaning – 150'}
              value={form.addons.map((a) => `${a.name}${a.price != null ? ` – ${a.price}` : ''}`).join('\n')}
              onChange={(e) =>
                set({
                  addons: e.target.value.split('\n').map((l) => {
                    const m = l.match(/^(.*?)\s*[–-]\s*\$?([\d.]+)\s*$/)
                    return m ? { name: m[1], price: Number(m[2]) } : { name: l, price: null }
                  }),
                })
              }
            />
          </Card>
        </section>

        <section>
          <GroupLabel>Standard turnover checklist</GroupLabel>
          <Card>
            <TextArea
              label="One item per line (load it into any walkthrough)"
              rows={6}
              disabled={!owner}
              value={form.turnover_checklist.join('\n')}
              onChange={(e) => set({ turnover_checklist: e.target.value.split('\n') })}
            />
          </Card>
          {owner && form.turnover_checklist.filter(Boolean).length === 0 && (
            <button type="button" className="mt-1.5 px-4 text-[15px] font-semibold text-brand" onClick={() => set({ turnover_checklist: defaultTurnoverChecklist })}>
              Start from a suggested list
            </button>
          )}
        </section>

        <section>
          <GroupLabel>Seasonal check-ups</GroupLabel>
          <Card>
            <TextArea
              label="Before winter (one per line)"
              rows={4}
              disabled={!owner}
              value={form.seasonal_checklists.winter.join('\n')}
              onChange={(e) => set({ seasonal_checklists: { ...form.seasonal_checklists, winter: e.target.value.split('\n') } })}
            />
            <Divider />
            <TextArea
              label="Before spring (one per line)"
              rows={4}
              disabled={!owner}
              value={form.seasonal_checklists.spring.join('\n')}
              onChange={(e) => set({ seasonal_checklists: { ...form.seasonal_checklists, spring: e.target.value.split('\n') } })}
            />
          </Card>
          {owner && !form.seasonal_checklists.winter.filter(Boolean).length && !form.seasonal_checklists.spring.filter(Boolean).length && (
            <button type="button" className="mt-1.5 px-4 text-[15px] font-semibold text-brand" onClick={() => set({ seasonal_checklists: defaultSeasonal })}>
              Start from suggested lists
            </button>
          )}
        </section>

        {save.error && <ErrorNote error={save.error} />}
        {owner ? (
          <Button
            type="submit"
            disabled={save.isPending}
          >
            {save.isPending ? 'Saving…' : save.isSuccess ? 'Saved' : 'Save'}
          </Button>
        ) : (
          <p className="px-1 text-[15px] text-muted">Only the owner can change these.</p>
        )}
      </form>
    </Screen>
  )
}

/** A printable poster: big QR code and the link */
export function RequestPosterScreen() {
  const { data } = useServiceSettings()
  const link = requestPageLink(data?.public_slug)
  const qr = useQr(link, 900)
  return (
    <Screen title="Print QR code" back={{ to: '/request-page', label: 'Request page' }}>
      <div className="mx-auto max-w-md rounded-3xl bg-white px-6 py-8 text-center print:rounded-none print:px-0">
        <p className="text-[34px] font-bold leading-tight">Need a repair?</p>
        <p className="mt-2 text-[20px]">Scan to send a request. Photos help us bring the right parts.</p>
        <p className="mt-1 text-[20px]" dir="rtl">צריכים תיקון? סרקו כדי לשלוח בקשה.</p>
        {qr ? <img src={qr} alt="QR code" className="mx-auto my-6 w-full max-w-[320px]" /> : <Loading />}
        <p className="break-all text-[17px] font-semibold">{link}</p>
      </div>
      <div className="mt-6 print:hidden">
        <Button onClick={() => window.print()}>
          <PrintIcon size={20} /> Print
        </Button>
      </div>
    </Screen>
  )
}
