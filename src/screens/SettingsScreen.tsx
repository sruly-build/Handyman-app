import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, GroupLabel, Loading, Segmented, Toggle } from '../components/ui'
import { backend } from '../data/backend'
import { formatMoney, withMarkup } from '../data/billing'
import { refreshAll, useSettings } from '../data/queries'
import type { Settings } from '../data/types'

/** Markup, hourly rate and the details printed on estimates and invoices */
export function SettingsScreen() {
  const { data, isLoading, error } = useSettings()
  const [form, setForm] = useState<(Omit<Settings, 'markup_percent' | 'hourly_rate'> & { markup_percent: string; hourly_rate: string }) | null>(null)
  const navigate = useNavigate()
  const qc = useQueryClient()

  useEffect(() => {
    if (data && !form) setForm({ ...data, markup_percent: String(data.markup_percent), hourly_rate: String(data.hourly_rate) })
  }, [data, form])

  const save = useMutation({
    mutationFn: () =>
      backend.saveSettings({
        ...form!,
        markup_percent: parseFloat(form!.markup_percent) || 0,
        hourly_rate: parseFloat(form!.hourly_rate) || 0,
      }),
    onSuccess: () => {
      void refreshAll(qc)
      navigate(-1)
    },
  })

  const back = { to: '/more', label: 'Me' }
  if (isLoading || error || !form) {
    return (
      <Screen title="Settings" back={back}>
        {error ? <ErrorNote error={error} /> : <Loading />}
      </Screen>
    )
  }

  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch })
  const pct = parseFloat(form.markup_percent) || 0
  const rate = parseFloat(form.hourly_rate) || 0

  function submit(e: FormEvent) {
    e.preventDefault()
    save.mutate()
  }

  return (
    <Screen title="Settings" back={back}>
      <form onSubmit={submit} className="space-y-6">
        <section>
          <GroupLabel>Pricing</GroupLabel>
          <Card>
            <div className="grid grid-cols-2">
              <Field
                label="Markup %"
                inputMode="decimal"
                value={form.markup_percent}
                onChange={(e) => set({ markup_percent: e.target.value.replace(/[^\d.]/g, '') })}
              />
              <Field
                label="Hourly rate $"
                inputMode="decimal"
                value={form.hourly_rate}
                onChange={(e) => set({ hourly_rate: e.target.value.replace(/[^\d.]/g, '') })}
                className="border-l border-hairline"
              />
            </div>
            <Divider />
            <Toggle
              label="Add markup to labour too"
              hint={`Customer pays ${formatMoney(form.markup_labour ? withMarkup(rate, pct) : rate)}/hour`}
              checked={form.markup_labour}
              onChange={(markup_labour) => set({ markup_labour })}
            />
          </Card>
          <p className="mt-1.5 px-4 text-[13px] text-muted">
            Example: a part that cost $50 shows as {formatMoney(withMarkup(50, pct))} on the bill.
          </p>
        </section>

        <section>
          <GroupLabel>Charge labour by</GroupLabel>
          <Segmented
            label="Charge labour by"
            value={form.labour_mode}
            onChange={(labour_mode) => set({ labour_mode })}
            options={[
              { value: 'task', label: 'Task timers' },
              { value: 'visit', label: 'Arrival to finish' },
            ]}
          />
          <p className="mt-1.5 px-4 text-[13px] text-muted">
            {form.labour_mode === 'task'
              ? 'Invoices charge the time on each task timer, listed per task.'
              : 'Invoices charge the whole time on site, from Arrived to Finished, for everyone.'}{' '}
            You can switch any time before making an invoice.
          </p>
        </section>

        <section>
          <GroupLabel>Shown on estimates and invoices</GroupLabel>
          <Card>
            <Field label="Business name" value={form.business_name} onChange={(e) => set({ business_name: e.target.value })} />
            <Divider />
            <Field label="Phone" type="tel" value={form.business_phone} onChange={(e) => set({ business_phone: e.target.value })} />
            <Divider />
            <Field
              label="Email"
              type="email"
              autoCapitalize="none"
              value={form.business_email}
              onChange={(e) => set({ business_email: e.target.value })}
            />
            <Divider />
            <Field label="Address" value={form.business_address} onChange={(e) => set({ business_address: e.target.value })} />
          </Card>
        </section>

        {save.error && <ErrorNote error={save.error} />}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save settings'}
        </Button>
      </form>
    </Screen>
  )
}
