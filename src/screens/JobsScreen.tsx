import { useState } from 'react'
import { Link } from 'react-router-dom'
import { JobCard } from '../components/JobCard'
import { PlusIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { EmptyState, ErrorNote, Loading, Segmented } from '../components/ui'
import { useJobs } from '../data/queries'
import { sharing, sortJobs } from '../data/summary'
import { useUser } from '../lib/auth'
import { todayISO } from '../lib/dates'

export function JobsScreen() {
  const { data: jobs, isLoading, error } = useJobs()
  const me = useUser().id
  const [filter, setFilter] = useState<'all' | 'mine' | 'shared'>('all')
  const isShared = (j: NonNullable<typeof jobs>[number]) => {
    const s = sharing(j, me)
    return !s.mine || s.sharedWith.length > 0
  }
  const anyShared = (jobs ?? []).some(isShared)
  const shown = (jobs ?? []).filter((j) =>
    filter === 'all' ? true : filter === 'shared' ? isShared(j) : sharing(j, me).mine && !isShared(j),
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
      {anyShared && (
        <div className="mb-4">
          <Segmented
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'mine', label: 'Just mine' },
              { value: 'shared', label: 'Shared' },
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
