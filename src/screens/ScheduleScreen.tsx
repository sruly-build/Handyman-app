import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import { BackIcon, ChevronIcon, CloseIcon, DirectionsIcon, MessageIcon, PhoneIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { TextClientSheet } from '../components/TextClient'
import { Card, ErrorNote, Loading, Segmented } from '../components/ui'
import { scheduleEvents, weekOf, type ScheduleEvent } from '../data/schedule'
import { useSchedule } from '../data/queries'
import { addDays, clockLabel, todayISO } from '../lib/dates'
import { directionsLink, phoneLink } from '../lib/links'

const longDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}
const shortDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Walkthroughs and jobs by day or week. Lives only in the app. */
export function ScheduleScreen() {
  const { data, isLoading, error } = useSchedule()
  const today = todayISO()
  // Kept in the address so Back from a job or lead returns to the same day
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'week' ? 'week' : 'day'
  const date = params.get('date') ?? today
  const go = (patch: { view?: string; date?: string }) =>
    setParams({ view: patch.view ?? view, date: patch.date ?? date }, { replace: true })
  const [open, setOpen] = useState<ScheduleEvent | null>(null)

  // Only our own leads and jobs (not jobs other companies shared with us)
  const events = scheduleEvents((data ?? []).filter((j) => j.from_company === null))
  const week = weekOf(date)
  const step = view === 'day' ? 1 : 7
  const title =
    view === 'day'
      ? date === today
        ? 'Today'
        : longDay(date)
      : `${shortDay(week[0])} – ${shortDay(week[6])}`

  return (
    <Screen title="Schedule">
      <Segmented
        label="View"
        value={view}
        onChange={(v) => go({ view: v })}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
        ]}
      />
      <div className="mt-3 flex items-center gap-1">
        <button
          onClick={() => go({ date: addDays(date, -step) })}
          className="flex h-11 w-11 items-center justify-center rounded-full text-brand active:bg-brand-soft"
          aria-label={view === 'day' ? 'Previous day' : 'Previous week'}
        >
          <BackIcon size={22} />
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold">{title}</p>
        <button
          onClick={() => go({ date: addDays(date, step) })}
          className="flex h-11 w-11 items-center justify-center rounded-full text-brand active:bg-brand-soft"
          aria-label={view === 'day' ? 'Next day' : 'Next week'}
        >
          <ChevronIcon size={22} />
        </button>
        {(view === 'day' ? date !== today : !week.includes(today)) && (
          <button onClick={() => go({ date: today })} className="min-h-11 px-2 text-[15px] font-semibold text-brand">
            Today
          </button>
        )}
      </div>

      <div className="mt-3">
        {isLoading && <Loading />}
        {error && <ErrorNote error={error} />}
        {data && view === 'day' && <DayList events={events.filter((e) => e.date === date)} onOpen={setOpen} />}
        {data &&
          view === 'week' &&
          week.map((d) => {
            const dayEvents = events.filter((e) => e.date === d)
            return (
              <section key={d} className="mb-4">
                <button
                  onClick={() => go({ view: 'day', date: d })}
                  className={`mb-1.5 px-1 text-[13px] font-semibold uppercase tracking-wide ${d === today ? 'text-brand' : 'text-muted'}`}
                >
                  {d === today ? `Today · ${shortDay(d)}` : shortDay(d)}
                </button>
                {dayEvents.length ? (
                  <EventCards events={dayEvents} onOpen={setOpen} />
                ) : (
                  <p className="px-1 text-[14px] text-[#aeaeb2]">Nothing booked</p>
                )}
              </section>
            )
          })}
      </div>

      {open && <EventSheet event={open} onClose={() => setOpen(null)} />}
    </Screen>
  )
}

function DayList({ events, onOpen }: { events: ScheduleEvent[]; onOpen: (e: ScheduleEvent) => void }) {
  if (events.length === 0) {
    return (
      <Card className="px-6 py-10 text-center">
        <p className="text-[17px] font-semibold">Nothing booked</p>
        <p className="mt-1 text-[15px] text-muted">Book walkthroughs on a lead, and give jobs a date.</p>
      </Card>
    )
  }
  return <EventCards events={events} onOpen={onOpen} />
}

function EventCards({ events, onOpen }: { events: ScheduleEvent[]; onOpen: (e: ScheduleEvent) => void }) {
  return (
    <Card>
      {events.map((e, i) => (
        <button
          key={e.key}
          onClick={() => onOpen(e)}
          className={`flex w-full items-center gap-3 px-4 py-3 text-left active:bg-canvas ${i > 0 ? 'border-t border-hairline' : ''}`}
        >
          <span className="w-16 shrink-0 text-[14px] font-semibold">{e.time ? clockLabel(e.time) : 'All day'}</span>
          <span
            className={`h-10 w-1 shrink-0 rounded-full ${e.kind === 'walkthrough' ? 'bg-progress' : 'bg-brand'}`}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[17px] font-semibold">{e.job.customer_name}</span>
            <span className="block truncate text-[14px] text-muted">
              {e.kind === 'walkthrough' ? 'Walkthrough' : 'Job'}
              {e.job.address ? ` · ${e.job.address}` : ''}
            </span>
          </span>
        </button>
      ))}
    </Card>
  )
}

/** Tapping something on the schedule: call, text, directions, or open it */
function EventSheet({ event, onClose }: { event: ScheduleEvent; onClose: () => void }) {
  const [texting, setTexting] = useState(false)
  const { job } = event
  if (texting) return <TextClientSheet phone={job.customer_phone} customer={job.customer_name} onClose={onClose} />

  const action =
    'flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl bg-canvas text-[15px] font-semibold text-brand active:bg-brand-soft'
  const disabled =
    'flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl bg-canvas text-[15px] font-semibold text-[#c7c7cc]'

  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label={job.customer_name}
        className="animate-sheet-up mx-auto w-full max-w-lg rounded-t-3xl bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start">
          <div className="min-w-0 flex-1">
            <p className={`text-[13px] font-semibold uppercase tracking-wide ${event.kind === 'walkthrough' ? 'text-[#8a4b00]' : 'text-brand-dark'}`}>
              {event.kind === 'walkthrough' ? 'Walkthrough' : 'Job'} · {shortDay(event.date)}
              {event.time ? ` · ${clockLabel(event.time)}` : ''}
            </p>
            <h2 className="text-[22px] font-bold">{job.customer_name}</h2>
            {job.address && <p className="text-[15px] text-muted">{job.address}</p>}
          </div>
          <button onClick={onClose} className="flex h-11 w-11 items-center justify-center text-muted" aria-label="Close">
            <CloseIcon size={22} />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {job.customer_phone ? (
            <a href={phoneLink(job.customer_phone)} className={action}>
              <PhoneIcon size={24} />
              Call
            </a>
          ) : (
            <span className={disabled}>
              <PhoneIcon size={24} />
              Call
            </span>
          )}
          {job.customer_phone ? (
            <button onClick={() => setTexting(true)} className={action}>
              <MessageIcon size={24} />
              Text
            </button>
          ) : (
            <span className={disabled}>
              <MessageIcon size={24} />
              Text
            </span>
          )}
          {job.address ? (
            <a href={directionsLink(job.address)} target="_blank" rel="noreferrer" className={action}>
              <DirectionsIcon size={24} />
              Directions
            </a>
          ) : (
            <span className={disabled}>
              <DirectionsIcon size={24} />
              Directions
            </span>
          )}
        </div>
        <Link
          to={`/jobs/${job.id}`}
          className="mt-3 flex min-h-14 items-center justify-center rounded-2xl bg-brand text-[17px] font-semibold text-white active:bg-brand-dark"
        >
          {event.kind === 'walkthrough' ? 'Open lead' : 'Open job'}
        </Link>
      </div>
    </div>,
    document.body,
  )
}
