import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backend } from '../data/backend'
import { refreshAll } from '../data/queries'
import type { Job, LeadStatus } from '../data/types'
import { clockLabel, friendlyDate, localParts, todayISO } from '../lib/dates'
import { CalendarIcon, CheckIcon } from './Icons'
import { Button, Card, ErrorNote, Field } from './ui'

export const leadStatusLabels: Record<LeadStatus, string> = {
  new: 'New',
  walkthrough_booked: 'Walkthrough booked',
  estimate_sent: 'Estimate sent',
  won: 'Won',
  lost: 'Lost',
}

/** Colours for a lead's status pill */
export const leadStatusStyle: Record<LeadStatus, string> = {
  new: 'bg-[#e8f0fe] text-[#1a56c4]',
  walkthrough_booked: 'bg-progress-soft text-[#8a4b00]',
  estimate_sent: 'bg-brand-soft text-brand-dark',
  won: 'bg-brand text-white',
  lost: 'bg-hairline text-[#48484a]',
}

export function LeadStatusPill({ status }: { status: LeadStatus }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold ${leadStatusStyle[status]}`}>
      {leadStatusLabels[status]}
    </span>
  )
}

/** "Thu, Oct 30 at 10:00 AM" */
export function walkthroughLabel(iso: string) {
  const { date, time } = localParts(iso)
  return `${friendlyDate(date)} at ${clockLabel(time)}`
}

/** On a lead's page: its status, the walkthrough booking, and Convert / Mark as lost */
export function LeadPanel({ lead }: { lead: Job }) {
  const status = lead.lead_status ?? 'new'
  const lost = status === 'lost'
  const qc = useQueryClient()
  const booked = lead.walkthrough_at ? localParts(lead.walkthrough_at) : null
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(booked?.date ?? todayISO())
  const [time, setTime] = useState(booked?.time ?? '09:00')

  const done = { onSettled: () => refreshAll(qc) }
  const book = useMutation({
    mutationFn: (at: string | null) => backend.bookWalkthrough(lead, at),
    onSuccess: () => setEditing(false),
    ...done,
  })
  const setStatus = useMutation({ mutationFn: (s: LeadStatus) => backend.setLeadStatus(lead, s), ...done })
  const reopen = useMutation({ mutationFn: () => backend.reopenLead(lead), ...done })
  const error = book.error || setStatus.error || reopen.error

  if (lost) {
    return (
      <Card className="mt-4 p-4">
        <p className="text-[15px] text-muted">
          This lead was marked as lost
          {lead.lead_closed_at ? ` on ${friendlyDate(todayISO(new Date(lead.lead_closed_at)))}` : ''}. It's kept under
          Leads → Archived.
        </p>
        {error && <ErrorNote error={error} />}
        <Button variant="secondary" className="mt-3" disabled={reopen.isPending} onClick={() => reopen.mutate()}>
          Reopen lead
        </Button>
      </Card>
    )
  }

  const choices: LeadStatus[] = ['new', 'walkthrough_booked', 'estimate_sent']
  return (
    <section className="mt-4 space-y-3">
      <div className="flex gap-1 rounded-2xl bg-hairline p-1" role="radiogroup" aria-label="Lead status">
        {choices.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={status === s}
            onClick={() => status !== s && setStatus.mutate(s)}
            className={`min-h-11 flex-1 rounded-xl px-1 text-[13px] font-semibold leading-tight transition ${
              status === s ? 'bg-white text-ink shadow' : 'text-[#48484a] active:opacity-60'
            }`}
          >
            {leadStatusLabels[s]}
          </button>
        ))}
      </div>

      <Card>
        {editing ? (
          <div>
            <p className="px-4 pt-3 text-[13px] font-semibold uppercase tracking-wide text-muted">Walkthrough</p>
            <div className="grid grid-cols-2">
              <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <Field
                label="Time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="border-l border-hairline"
              />
            </div>
            <div className="px-4 pb-1">
              <Button
                disabled={!date || !time || book.isPending}
                onClick={() => book.mutate(new Date(`${date}T${time}`).toISOString())}
              >
                {book.isPending ? 'Saving…' : 'Save walkthrough'}
              </Button>
            </div>
            <div className="flex justify-between px-4 pb-2">
              <button onClick={() => setEditing(false)} className="min-h-11 text-[15px] text-muted">
                Never mind
              </button>
              {booked && (
                <button
                  onClick={() => confirm('Cancel the walkthrough?') && book.mutate(null)}
                  className="min-h-11 text-[15px] font-semibold text-problem"
                >
                  Cancel walkthrough
                </button>
              )}
            </div>
          </div>
        ) : booked ? (
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-progress-soft text-[#8a4b00]">
              <CalendarIcon size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">Walkthrough</p>
              <p className="text-[17px] font-semibold">{walkthroughLabel(lead.walkthrough_at!)}</p>
            </div>
            <button onClick={() => setEditing(true)} className="min-h-11 px-2 text-[15px] font-semibold text-brand">
              Change
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex min-h-14 w-full items-center justify-center gap-2 text-[17px] font-semibold text-brand active:bg-canvas"
          >
            <CalendarIcon size={22} />
            Book walkthrough
          </button>
        )}
      </Card>
      <p className="px-4 text-[13px] text-muted">
        At the walkthrough, add the punch list below: photos, measurements and notes on each item.
      </p>

      {error && <ErrorNote error={error} />}
    </section>
  )
}

/** The bottom of a lead's page: turn it into a job, or archive it */
export function LeadActions({ lead }: { lead: Job }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const convert = useMutation({
    mutationFn: () => backend.convertLead(lead),
    onSuccess: () => {
      void refreshAll(qc)
      navigate(`/jobs/${lead.id}/edit`)
    },
  })
  const lose = useMutation({
    mutationFn: () => backend.setLeadStatus(lead, 'lost'),
    onSettled: () => refreshAll(qc),
  })
  if (lead.lead_status === 'lost') return null
  return (
    <div className="mt-8 space-y-3">
      {(convert.error || lose.error) && <ErrorNote error={convert.error || lose.error} />}
      <Button
        disabled={convert.isPending}
        onClick={() =>
          confirm('Turn this lead into a job? Everything on it (punch list, photos, measurements, notes) stays.') &&
          convert.mutate()
        }
      >
        <CheckIcon size={22} strokeWidth={2.6} />
        {convert.isPending ? 'Converting…' : 'Convert to job'}
      </Button>
      <Button
        variant="danger"
        disabled={lose.isPending}
        onClick={() =>
          confirm('Mark this lead as lost? It moves to Leads → Archived, where you can reopen it.') && lose.mutate()
        }
      >
        Mark as lost
      </Button>
    </div>
  )
}
