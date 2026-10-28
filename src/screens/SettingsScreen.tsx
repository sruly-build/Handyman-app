import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, GroupLabel, Loading, Segmented, Toggle } from '../components/ui'
import { backend } from '../data/backend'
import { formatMoney, withMarkup } from '../data/billing'
import { refreshAll, useSettings } from '../data/queries'
import { useUser } from '../lib/auth'
import type { Settings } from '../data/types'

/** Markup, service call and hourly rates, and how labour is charged (owners edit, members view) */
export function SettingsScreen() {
  const { data, isLoading, error } = useSettings()
  const canEdit = useUser().role === 'owner'
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
      <Screen title="Prices" back={back}>
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
    <Screen title="Prices" back={back}>
      <form onSubmit={submit} className="space-y-6">
        <fieldset disabled={!canEdit} className="space-y-6">
        <section>
          <GroupLabel>Labour</GroupLabel>
          <Card>
            <div className="grid grid-cols-2">
              <Field
                label="Service call (first hour) $"
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
            Every job is charged at least 1 hour. Bills show labour as the service call plus any additional time, not per item.
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
              ? 'Labour is the total of everyone\'s task timers on the job.'
              : 'Labour is the whole time on site, from Arrived to Finished, for everyone.'}{' '}
            You can switch any time before making an invoice.
          </p>
        </section>

        </fieldset>

        {!canEdit && (
          <p className="rounded-2xl bg-progress-soft px-4 py-3 text-[14px] text-[#9a5300]">
            Only the company owner can change prices.
          </p>
        )}
        <p className="px-4 text-[13px] text-muted">
          These prices are only seen by your company. Companies you share a job with never see them.
        </p>

        {save.error && <ErrorNote error={save.error} />}
        {canEdit && (
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save prices'}
          </Button>
        )}
      </form>
    </Screen>
  )
}
