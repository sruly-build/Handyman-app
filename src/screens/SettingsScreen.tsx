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
  // Number boxes are kept as typed text until saved
  const [form, setForm] = useState<
    | (Omit<Settings, 'markup_percent' | 'hourly_rate' | 'first_hour_rate'> & {
        markup_percent: string
        hourly_rate: string
        first_hour_rate: string
      })
    | null
  >(null)
  const navigate = useNavigate()
  const qc = useQueryClient()

  useEffect(() => {
    if (data && !form) {
      setForm({
        ...data,
        markup_percent: String(data.markup_percent),
        hourly_rate: String(data.hourly_rate),
        first_hour_rate: data.first_hour_rate == null ? '' : String(data.first_hour_rate),
      })
    }
  }, [data, form])

  const save = useMutation({
    mutationFn: () =>
      backend.saveSettings({
        ...form!,
        markup_percent: parseFloat(form!.markup_percent) || 0,
        hourly_rate: parseFloat(form!.hourly_rate) || 0,
        first_hour_rate: parseFloat(form!.first_hour_rate) > 0 ? parseFloat(form!.first_hour_rate) : null,
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
  const first = parseFloat(form.first_hour_rate) > 0 ? parseFloat(form.first_hour_rate) : null
  const labourPrice = (n: number) => formatMoney(form.markup_labour ? withMarkup(n, pct) : n)

  function submit(e: FormEvent) {
    e.preventDefault()
    save.mutate()
  }

  return (
    <Screen title="Settings" back={back}>
      <form onSubmit={submit} className="space-y-6">
        <section>
          <GroupLabel>Labour</GroupLabel>
          <Card>
            <div className="grid grid-cols-2">
              <Field
                label="First hour $"
                inputMode="decimal"
                value={form.first_hour_rate}
                onChange={(e) => set({ first_hour_rate: e.target.value.replace(/[^\d.]/g, '') })}
                placeholder="Same as hourly"
              />
              <Field
                label={first ? 'Each hour after $' : 'Hourly rate $'}
                inputMode="decimal"
                value={form.hourly_rate}
                onChange={(e) => set({ hourly_rate: e.target.value.replace(/[^\d.]/g, '') })}
                className="border-l border-hairline"
              />
            </div>
          </Card>
          <p className="mt-1.5 px-4 text-[13px] text-muted">
            {first
              ? `The first hour of each job is ${labourPrice(first)}, then ${labourPrice(rate)} per hour. Example: 3 hours = ${labourPrice(first + 2 * rate)}.`
              : `Every hour is ${labourPrice(rate)}. Fill in First hour to charge more for the first hour of a job.`}{' '}
            Every job is charged at least 1 hour of labour.
          </p>
        </section>

        <section>
          <GroupLabel>Markup</GroupLabel>
          <Card>
            <Field
              label="Markup %"
              inputMode="decimal"
              value={form.markup_percent}
              onChange={(e) => set({ markup_percent: e.target.value.replace(/[^\d.]/g, '') })}
            />
            <Divider />
            <Toggle
              label="Add markup to materials"
              hint={
                form.markup_parts
                  ? `A part that cost $50 shows as ${formatMoney(withMarkup(50, pct))} on the bill`
                  : 'Materials are billed at what you paid'
              }
              checked={form.markup_parts}
              onChange={(markup_parts) => set({ markup_parts })}
            />
            <Divider />
            <Toggle
              label="Add markup to labour"
              hint={form.markup_labour ? `Labour rates go up by ${pct}% on the bill` : 'Labour is billed at your rates above'}
              checked={form.markup_labour}
              onChange={(markup_labour) => set({ markup_labour })}
            />
          </Card>
          <p className="mt-1.5 px-4 text-[13px] text-muted">
            You can also switch the markup on materials on or off for a single job, on its Billing screen.
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

        <p className="px-4 text-[13px] text-muted">
          These are your own settings, used on your jobs. Jobs shared with you use their owner's settings.
        </p>

        {save.error && <ErrorNote error={save.error} />}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save settings'}
        </Button>
      </form>
    </Screen>
  )
}
