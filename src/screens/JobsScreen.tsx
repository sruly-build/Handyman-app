import { Link } from 'react-router-dom'
import { JobCard } from '../components/JobCard'
import { PlusIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { EmptyState, ErrorNote, Loading } from '../components/ui'
import { useJobs } from '../data/queries'
import { sortJobs } from '../data/summary'
import { todayISO } from '../lib/dates'

export function JobsScreen() {
  const { data: jobs, isLoading, error } = useJobs()
  const sorted = sortJobs(jobs ?? [], todayISO())

  return (
    <Screen
      title="Jobs"
      action={
        <Link
          to="/jobs/new"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white active:bg-brand-dark"
          aria-label="New job"
        >
          <PlusIcon size={24} strokeWidth={2.6} />
        </Link>
      }
    >
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {jobs && jobs.length === 0 && (
        <EmptyState title="No jobs yet">Tap the green + button to add your first job.</EmptyState>
      )}
      <div className="space-y-3">
        {sorted.map((j) => (
          <JobCard key={j.id} job={j} />
        ))}
      </div>
    </Screen>
  )
}
