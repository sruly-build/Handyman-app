import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { backend } from '../data/backend'
import { refreshAll, usePeopleNames } from '../data/queries'
import { followUpTiming, outcomeLabels, quickDates, stageLabels } from '../data/sales'
import type { CallOutcome, FollowUpInput, ProspectStage, ProspectView } from '../data/types'
import { clockLabel, friendlyDate, localParts, todayISO } from '../lib/dates'
import { phoneLink } from '../lib/links'
import { CalendarIcon, CloseIcon, PhoneIcon } from './Icons'
import { Button, ErrorNote, Field, TextArea } from './ui'

const sections = [
  { to: '/sales', label: 'Dashboard', exact: true },
  { to: '/sales/leads', label: 'Leads' },
  { to: '/sales/calls', label: 'Call list' },
  { to: '/sales/follow-ups', label: 'Follow-ups' },
  { to: '/sales/pipeline', label: 'Pipeline' },
  { to: '/leads', label: 'Turnovers' },
]

/** The row of Sales sections at the top of each Sales page */
export function SalesNav() {
  const { pathname } = useLocation()
  return (
    <nav aria-label="Sales" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {sections.map((s) => {
        const active = s.exact ? pathname === s.to : pathname.startsWith(s.to)
        return (
          <Link
            key={s.to}
            to={s.to}
            replace
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-10 shrink-0 items-center rounded-full px-4 text-[15px] font-semibold transition ${
              active ? 'bg-ink text-white' : 'bg-card text-ink active:opacity-60'
            }`}
          >
            {s.label}
          </Link>
        )
      })}
    </nav>
  )
}

const stageStyle: Record<ProspectStage, string> = {
  new: 'bg-[#e8f0fe] text-[#1a56c4]',
  contacted: 'bg-hairline text-[#48484a]',
  follow_up: 'bg-progress-soft text-[#8a4b00]',
  interested: 'bg-brand-soft text-brand-dark',
  meeting: 'bg-[#efe7fb] text-[#5b2bb5]',
  proposal: 'bg-[#e3f2fd] text-[#0b5394]',
  converted: 'bg-brand text-white',
  not_interested: 'bg-hairline text-[#6e6e73]',
}

export function StagePill({ stage }: { stage: ProspectStage }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold ${stageStyle[stage]}`}>
      {stageLabels[stage]}
    </span>
  )
}

/** "Tue, Nov 3 · 10:00 AM" */
export function whenLabel(iso: string) {
  const { date, time } = localParts(iso)
  return `${friendlyDate(date)} · ${clockLabel(time)}`
}

/** The lead's next follow-up, red when overdue */
export function FollowUpLine({ lead }: { lead: ProspectView }) {
  const f = lead.follow_up
  if (!f) return null
  const timing = followUpTiming(f)
  return (
    <p
      className={`flex items-center gap-1 text-[13px] font-semibold ${
        timing === 'overdue' ? 'text-problem' : timing === 'today' ? 'text-[#8a4b00]' : 'text-muted'
      }`}
    >
      <CalendarIcon size={14} />
      {timing === 'overdue' ? 'Overdue: ' : ''}
      {f.kind === 'meeting' ? 'Meeting ' : 'Call '}
      {whenLabel(f.due_at)}
    </p>
  )
}

/**
 * The big Call button: opens the phone's dialer and, at the same time, the
 * "How did it go?" pop-up, which is waiting when you come back to the app.
 * Nothing is recorded until you pick a result.
 */
export function CallButton({
  lead,
  children,
  className,
}: {
  lead: ProspectView
  children?: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  if (!lead.phone) {
    return (
      <span
        className={`${className ?? 'flex h-12 w-12 shrink-0 items-center justify-center rounded-full'} !bg-hairline !text-[#aeaeb2] !shadow-none`}
        aria-label="No phone number"
      >
        {children ?? <PhoneIcon size={22} />}
      </span>
    )
  }
  return (
    <>
      <a
        href={phoneLink(lead.phone)}
        onClick={() => setOpen(true)}
        className={
          className ??
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white active:bg-brand-dark'
        }
        aria-label={`Call ${lead.name}`}
      >
        {children ?? <PhoneIcon size={22} />}
      </a>
      {open && <CallResultSheet lead={lead} onClose={() => setOpen(false)} />}
    </>
  )
}

const outcomes: CallOutcome[] = ['no_answer', 'voicemail', 'call_back', 'interested', 'meeting', 'not_interested']

/** After a call: the result, a note, and the next follow-up, saved in one go */
export function CallResultSheet({ lead, onClose }: { lead: ProspectView; onClose: () => void }) {
  const qc = useQueryClient()
  const [outcome, setOutcome] = useState<CallOutcome | null>(null)
  const [note, setNote] = useState('')
  const [next, setNext] = useState<FollowUpInput | null>(null)

  function pick(o: CallOutcome) {
    setOutcome(o)
    // A sensible next step, which can be changed
    if (o === 'no_answer' || o === 'voicemail') setNext(followUpOn(quickDates()[0].date, '10:00', 'call', ''))
    else if (o === 'meeting') setNext(followUpOn(quickDates()[1].date, '10:00', 'meeting', ''))
    else if (o === 'not_interested') setNext(null)
    else if (!next) setNext(null)
  }

  const save = useMutation({
    mutationFn: () => backend.logCall(lead, outcome!, note, next),
    onSuccess: onClose,
    onSettled: () => refreshAll(qc),
  })

  return (
    <Sheet title={`How did it go with ${lead.name.split(/\s+/)[0]}?`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Call result">
        {outcomes.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={outcome === o}
            onClick={() => pick(o)}
            className={`min-h-12 rounded-2xl px-2 text-[15px] font-semibold transition ${
              outcome === o ? 'bg-brand text-white' : 'bg-canvas text-ink active:opacity-60'
            }`}
          >
            {outcomeLabels[o]}
          </button>
        ))}
      </div>
      {outcome && (
        <>
          <div className="mt-3 rounded-2xl bg-canvas">
            <TextArea
              aria-label="What was said"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What was said (optional)"
            />
          </div>
          {outcome !== 'not_interested' && (
            <FollowUpPicker
              value={next}
              onChange={setNext}
              defaultKind={outcome === 'meeting' ? 'meeting' : 'call'}
              allowNone
            />
          )}
          {save.error && <ErrorNote error={save.error} />}
          <Button className="mt-4" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      )}
      <button type="button" onClick={onClose} className="mt-2 min-h-11 w-full text-[15px] text-muted">
        {outcome ? 'Cancel' : "I didn't call"}
      </button>
    </Sheet>
  )
}

/** Make a follow-up for a local date and time */
export function followUpOn(date: string, time: string, kind: 'call' | 'meeting', note: string): FollowUpInput {
  return { kind, due_at: new Date(`${date}T${time}`).toISOString(), note }
}

/** Pick when to follow up in a couple of taps: quick dates, a time, and a note */
export function FollowUpPicker({
  value,
  onChange,
  defaultKind = 'call',
  allowNone = false,
}: {
  value: FollowUpInput | null
  onChange: (v: FollowUpInput | null) => void
  defaultKind?: 'call' | 'meeting'
  allowNone?: boolean
}) {
  const current = value ? localParts(value.due_at) : null
  const kind = value?.kind ?? defaultKind
  const time = current?.time ?? '10:00'
  const set = (patch: { date?: string; time?: string; kind?: 'call' | 'meeting'; note?: string }) =>
    onChange(
      followUpOn(
        patch.date ?? current?.date ?? quickDates()[0].date,
        patch.time ?? time,
        patch.kind ?? kind,
        patch.note ?? value?.note ?? '',
      ),
    )
  const chip = (active: boolean) =>
    `min-h-10 rounded-full px-3 text-[14px] font-semibold transition ${
      active ? 'bg-brand text-white' : 'bg-canvas text-ink active:opacity-60'
    }`

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">Next follow-up</p>
        <div className="flex gap-1 rounded-full bg-canvas p-0.5" role="radiogroup" aria-label="Follow-up type">
          {(['call', 'meeting'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => set({ kind: k })}
              className={`min-h-8 rounded-full px-3 text-[13px] font-semibold ${kind === k && value ? 'bg-white shadow' : 'text-muted'}`}
            >
              {k === 'call' ? 'Call' : 'Meeting'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Follow-up day">
        {allowNone && (
          <button
            type="button"
            role="radio"
            aria-checked={!value}
            className={chip(!value)}
            onClick={() => onChange(null)}
          >
            None
          </button>
        )}
        {quickDates().map((q) => (
          <button
            key={q.label}
            type="button"
            role="radio"
            aria-checked={current?.date === q.date}
            className={chip(current?.date === q.date)}
            onClick={() => set({ date: q.date })}
          >
            {q.label}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-2xl bg-canvas">
        <Field
          label="Date"
          type="date"
          min={todayISO()}
          value={current?.date ?? ''}
          onChange={(e) => e.target.value && set({ date: e.target.value })}
        />
        <Field
          label="Time"
          type="time"
          value={current ? time : ''}
          onChange={(e) => e.target.value && set({ time: e.target.value })}
          className="border-l border-hairline"
        />
      </div>
      {value && (
        <div className="mt-2 rounded-2xl bg-canvas">
          <Field
            label="Reminder note"
            value={value.note}
            onChange={(e) => set({ note: e.target.value })}
            placeholder={kind === 'meeting' ? 'e.g. At their office' : 'e.g. Ask about the 3 units on Main St'}
          />
        </div>
      )}
    </div>
  )
}

/** Set or move a lead's follow-up on its own */
export function FollowUpSheet({ lead, onClose }: { lead: ProspectView; onClose: () => void }) {
  const qc = useQueryClient()
  const [value, setValue] = useState<FollowUpInput | null>(
    lead.follow_up
      ? { kind: lead.follow_up.kind, due_at: lead.follow_up.due_at, note: lead.follow_up.note }
      : followUpOn(quickDates()[0].date, '10:00', 'call', ''),
  )
  const save = useMutation({
    mutationFn: () => backend.setFollowUp(lead.id, value!),
    onSuccess: onClose,
    onSettled: () => refreshAll(qc),
  })
  return (
    <Sheet
      title={lead.follow_up ? `Reschedule ${lead.name.split(/\s+/)[0]}` : `Follow up with ${lead.name.split(/\s+/)[0]}`}
      onClose={onClose}
    >
      <FollowUpPicker value={value} onChange={setValue} />
      {save.error && <ErrorNote error={save.error} />}
      <Button className="mt-4" disabled={!value || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? 'Saving…' : 'Save follow-up'}
      </Button>
    </Sheet>
  )
}

/** Bottom pop-up used by the sales screens */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up mx-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4"
      >
        <div className="mb-3 flex items-center">
          <h2 className="min-w-0 flex-1 truncate text-[20px] font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center text-muted"
            aria-label="Close"
          >
            <CloseIcon size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** A compact lead card: name, company, stage, next follow-up, who has it, and a big Call button */
export function LeadCard({ lead, extra }: { lead: ProspectView; extra?: ReactNode }) {
  const nameOf = usePeopleNames()
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card p-3 pl-4">
      <Link to={`/sales/leads/${lead.id}`} className="min-w-0 flex-1 active:opacity-60">
        <div className="flex items-center gap-2">
          <p className="min-w-0 truncate text-[17px] font-semibold">{lead.name}</p>
          <StagePill stage={lead.stage} />
        </div>
        {lead.org && <p className="truncate text-[14px] text-muted">{lead.org.name}</p>}
        <FollowUpLine lead={lead} />
        <p className="truncate text-[12px] text-muted">
          {lead.assigned_to ? `${nameOf(lead.assigned_to)}'s lead` : 'Not assigned'}
          {lead.last_contacted_at && lead.last_contacted_by
            ? ` · last call ${nameOf(lead.last_contacted_by)}, ${friendlyDate(todayISO(new Date(lead.last_contacted_at)))}`
            : ''}
        </p>
        {extra}
      </Link>
      <CallButton lead={lead} />
    </div>
  )
}
