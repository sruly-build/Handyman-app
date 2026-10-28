import { useState } from 'react'
import { Link } from 'react-router-dom'
import { JobCard } from '../components/JobCard'
import { PlusIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { EmptyState, ErrorNote, Loading, Segmented } from '../components/ui'
import { useJobs } from '../data/queries'
import { sortJobs } from '../data/summary'
import { todayISO } from '../lib/dates'

export function JobsScreen() {
  const { data: jobs, isLoading, error } = useJobs()
  const [filter, setFilter] = useState<'all' | 'ours' | 'others'>('all')
  // Jobs other companies shared with us (punch list and photos only)
  const anyFromOthers = (jobs ?? []).some((j) => j.from_company !== null)
  const shown = (jobs ?? []).filter((j) =>
    filter === 'all' ? true : filter === 'others' ? j.from_company !== null : j.from_company === null,
  )
  const sorted = sortJobs(shown, todayISO())

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
      {anyFromOthers && (
        <div className="mb-4">
          <Segmented
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'ours', label: 'Ours' },
              { value: 'others', label: 'Shared with us' },
            ]}
          />
        </div>
      )}
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {jobs && jobs.length > 0 && sorted.length === 0 && <EmptyState title="No jobs here" />}
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
