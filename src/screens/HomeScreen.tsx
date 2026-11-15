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
  const busyToday = todays.length + walkthroughs.length > 3
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
    <Screen title={`${greeting()}, ${user.name}`} eyebrow={dateLine}>
      <div className="grid grid-cols-2 gap-3">
        <QuickLink to="/orders" label="Orders" Icon={OrdersIcon} />
        <QuickLink to="/bring" label="Bring list" Icon={ChecklistIcon} />
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
      {jobs && todays.length === 0 && (
        <EmptyState title="No jobs today">Jobs with today's date will show up here.</EmptyState>
      )}
      <div className="space-y-3">
        {todays.map((j) => (
          <JobCard key={j.id} job={j} />
        ))}
      </div>

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

function QuickLink({ to, label, Icon }: { to: string; label: string; Icon: typeof OrdersIcon }) {
  return (
    <Link to={to} className="transition active:scale-[0.97]">
      <Card className="flex min-h-[88px] flex-col justify-between p-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Icon size={22} />
        </span>
        <span className="text-[17px] font-semibold">{label}</span>
      </Card>
    </Link>
  )
}
