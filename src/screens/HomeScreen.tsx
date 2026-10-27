import { Link } from 'react-router-dom'
import { JobCard } from '../components/JobCard'
import { ChecklistIcon, OrdersIcon, PlusIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { Card, EmptyState, ErrorNote, Loading, SectionTitle } from '../components/ui'
import { useJobs } from '../data/queries'
import { sortJobs } from '../data/summary'
import { greeting, todayISO } from '../lib/dates'
import { useUser } from '../lib/auth'

export function HomeScreen() {
  const user = useUser()
  const { data: jobs, isLoading, error } = useJobs()
  const today = todayISO()
  const todays = (jobs ?? []).filter((j) => j.job_date === today)
  const upcoming = sortJobs(
    (jobs ?? []).filter((j) => j.job_date !== null && j.job_date > today),
    today,
  ).slice(0, 3)

  const dateLine = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <Screen title={`${greeting()}, ${user.name}`} eyebrow={dateLine}>
      <Link
        to="/jobs/new"
        className="flex min-h-[72px] items-center justify-center gap-3 rounded-3xl bg-brand text-[21px] font-bold text-white shadow-[0_8px_24px_rgba(15,157,122,0.35)] transition active:scale-[0.98] active:bg-brand-dark"
      >
        <PlusIcon size={30} strokeWidth={2.6} />
        New job
      </Link>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <QuickLink to="/orders" label="Orders" Icon={OrdersIcon} />
        <QuickLink to="/bring" label="Bring list" Icon={ChecklistIcon} />
      </div>

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
