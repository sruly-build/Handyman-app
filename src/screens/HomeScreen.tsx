import { useState } from 'react'
import { Link } from 'react-router-dom'
import { StopList, useDayStops } from '../components/DayStops'
import { JobCard } from '../components/JobCard'
import { ChecklistIcon, ChevronIcon, OrdersIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { Card, EmptyState, ErrorNote, Loading, SectionTitle } from '../components/ui'
import { useJobs, useLeads } from '../data/queries'
import { sortJobs } from '../data/summary'
import { addDays, clockLabel, friendlyDate, greeting, localParts, todayISO } from '../lib/dates'
import { useUser } from '../lib/auth'

export function HomeScreen() {
  const user = useUser()
  const { data: jobs, isLoading, error } = useJobs()
  const today = todayISO()
  const { data: leads = [] } = useLeads()
  // Walkthroughs booked for today, in time order
  const walkthroughs = leads
    .filter(
      (l) =>
        l.from_company === null &&
        l.lead_status !== 'lost' &&
        l.walkthrough_at &&
        localParts(l.walkthrough_at).date === today,
    )
    .sort((a, b) => a.walkthrough_at!.localeCompare(b.walkthrough_at!))
  const todays = (jobs ?? []).filter((j) => j.job_date === today)
  // Tomorrow has its own section, so "Coming up" starts the day after
  const tomorrowISO = addDays(today, 1)
  const { stops: tomorrowStops } = useDayStops(tomorrowISO)
  // Busy today (more than 3 places to go): tomorrow starts folded up
  // Today's other places to go: punch items planned for today, scheduled requests,
  // sales meetings (today's jobs and walkthroughs have their own cards)
  const { stops: todayStops } = useDayStops(today)
  const otherToday = todayStops.filter((s) => s.kind !== 'job' && s.kind !== 'walkthrough')
  const busyToday = todays.length + walkthroughs.length + otherToday.length > 3
  const [tomorrowOpen, setTomorrowOpen] = useState<boolean | null>(null)
  const showTomorrow = tomorrowOpen ?? !busyToday
  const upcoming = sortJobs(
    (jobs ?? []).filter((j) => j.job_date !== null && j.job_date > tomorrowISO),
    today,
  ).slice(0, 3)

  const tomorrow = sortJobs(
    (jobs ?? []).filter(
      (j) => j.from_company === null && j.job_date !== null && friendlyDate(j.job_date, today) === 'Tomorrow',
    ),
    today,
  )
  const evening = new Date().getHours() >= 15

  const dateLine = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <Screen
      title={`${greeting()}, ${user.name}`}
      hero={
        <div className="shine mb-5 mt-1 rounded-[28px] bg-gradient-to-br from-[#0f172a] to-[#1e293b] px-5 py-5 text-white shadow-[0_14px_36px_-10px_rgba(15,23,42,0.5)]">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-white/60">{dateLine}</p>
          <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-tight">
            {greeting()}, {user.name}
          </h1>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/12 px-3 py-2.5 ring-1 ring-white/15 backdrop-blur">
              <p className="text-[26px] font-bold leading-none tabular-nums text-white">{todays.length + walkthroughs.length + otherToday.length}</p>
              <p className="mt-1 text-[13px] font-semibold text-white/80">Places today</p>
            </div>
            <div className="rounded-2xl bg-white/12 px-3 py-2.5 ring-1 ring-white/15 backdrop-blur">
              <p className="text-[26px] font-bold leading-none tabular-nums">{tomorrowStops.length}</p>
              <p className="mt-1 text-[13px] font-semibold text-white/75">Tomorrow</p>
            </div>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <QuickLink to="/orders" label="Orders" Icon={OrdersIcon} tone="bg-sun-soft text-sun" />
        <QuickLink to="/bring" label="Bring list" Icon={ChecklistIcon} tone="bg-sky-soft text-sky" />
      </div>

      {evening && tomorrow.length > 0 && (
        <Link
          to={tomorrow.length === 1 ? `/jobs/${tomorrow[0].id}/bring` : '/bring'}
          className="mt-4 flex items-center gap-3 rounded-2xl bg-progress-soft p-4 active:opacity-70"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-progress text-white">
            <ChecklistIcon size={22} />
          </span>
          <span className="flex-1">
            <span className="block text-[17px] font-semibold">Load the van for tomorrow</span>
            <span className="block text-[14px] text-[#9a5300]">
              {tomorrow.map((j) => j.customer_name).join(', ')}
            </span>
          </span>
        </Link>
      )}

      {walkthroughs.length > 0 && (
        <>
          <SectionTitle
            action={
              <Link to="/schedule" className="pb-0.5 text-[15px] font-semibold text-brand">
                Schedule
              </Link>
            }
          >
            Walkthroughs today
          </SectionTitle>
          <Card>
            {walkthroughs.map((w, i) => (
              <Link
                key={w.id}
                to={`/jobs/${w.id}`}
                className={`flex items-center gap-3 px-4 py-3 active:bg-canvas ${i > 0 ? 'border-t border-hairline' : ''}`}
              >
                <span className="w-16 shrink-0 text-[14px] font-semibold text-[#8a4b00]">
                  {clockLabel(localParts(w.walkthrough_at!).time)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] font-semibold">{w.customer_name}</span>
                  {w.address && <span className="block truncate text-[14px] text-muted">{w.address}</span>}
                </span>
                <ChevronIcon size={18} className="shrink-0 text-[#c7c7cc]" />
              </Link>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>Today</SectionTitle>
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {jobs && todays.length === 0 && otherToday.length === 0 && (
        <EmptyState title="Nothing planned today">Jobs, punch items and requests planned for today show up here.</EmptyState>
      )}
      <div className="space-y-3">
        {todays.map((j) => (
          <JobCard key={j.id} job={j} />
        ))}
      </div>
      {otherToday.length > 0 && (
        <div className="mt-3">
          <StopList stops={otherToday} />
        </div>
      )}

      {tomorrowStops.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setTomorrowOpen(!showTomorrow)}
            aria-expanded={showTomorrow}
            className="mb-2 mt-7 flex w-full items-end justify-between px-1 text-left"
          >
            <span className="text-[22px] font-bold tracking-tight">
              Tomorrow <span className="text-[17px] font-semibold text-muted">· {tomorrowStops.length} place{tomorrowStops.length === 1 ? '' : 's'}</span>
            </span>
            <span className="flex items-center gap-1 pb-0.5 text-[15px] font-semibold text-brand">
              {showTomorrow ? 'Hide' : 'Show'}
              <ChevronIcon size={16} className={`transition-transform ${showTomorrow ? '-rotate-90' : 'rotate-90'}`} />
            </span>
          </button>
          {showTomorrow ? (
            <StopList stops={tomorrowStops} />
          ) : (
            <button
              type="button"
              onClick={() => setTomorrowOpen(true)}
              className="w-full truncate rounded-2xl bg-card px-4 py-3 text-left text-[15px] text-muted active:bg-canvas"
            >
              {tomorrowStops.map((s) => (s.address || s.name).split(',')[0]).join(' · ')}
            </button>
          )}
        </section>
      )}

      {upcoming.length > 0 && (
        <>
          <SectionTitle
            action={
              <Link to="/jobs" className="min-h-11 py-2 text-[17px] text-brand">
                See all
              </Link>
            }
          >
            Coming up
          </SectionTitle>
          <div className="space-y-3">
            {upcoming.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        </>
      )}
    </Screen>
  )
}

function QuickLink({ to, label, Icon, tone }: { to: string; label: string; Icon: typeof OrdersIcon; tone: string }) {
  return (
    <Link to={to} className="transition active:scale-[0.97]">
      <Card className="flex min-h-[88px] flex-col justify-between p-4">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
          <Icon size={22} />
        </span>
        <span className="text-[17px] font-semibold">{label}</span>
      </Card>
    </Link>
  )
}
