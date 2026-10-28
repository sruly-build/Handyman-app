import { Link } from 'react-router-dom'
import { ChevronIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { Card, EmptyState, Loading, ProgressBar } from '../components/ui'
import { buildBringList } from '../data/bring'
import { useAllBringChecks, useAllItems, useJobs, useParts } from '../data/queries'
import { sortJobs } from '../data/summary'
import { friendlyDate, todayISO } from '../lib/dates'

/** Bring lists for today's and upcoming jobs */
export function BringOverviewScreen() {
  const { data: jobs, isLoading } = useJobs()
  const { data: items = [] } = useAllItems()
  const { data: parts = [] } = useParts()
  const { data: checks = [] } = useAllBringChecks()
  const today = todayISO()
  const upcoming = sortJobs((jobs ?? []).filter((j) => j.from_company === null && j.job_date !== null && j.job_date >= today), today)

  return (
    <Screen title="Bring lists">
      {isLoading && <Loading />}
      {jobs && upcoming.length === 0 && (
        <EmptyState title="No upcoming jobs">Bring lists show here for jobs dated today or later.</EmptyState>
      )}
      <div className="space-y-3">
        {upcoming.map((job) => {
          const list = buildBringList(
            items.filter((i) => i.job_id === job.id),
            parts.filter((p) => p.job_id === job.id),
            job.bring_extras ?? [],
          )
          const packed = list.filter((e) => checks.some((c) => c.job_id === job.id && c.key === e.key)).length
          return (
            <Link key={job.id} to={`/jobs/${job.id}/bring`} className="block transition active:scale-[0.98]">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[19px] font-semibold">{job.customer_name}</p>
                    <p className="text-[15px] text-muted">{friendlyDate(job.job_date)}</p>
                  </div>
                  <ChevronIcon size={20} className="shrink-0 text-[#c7c7cc]" />
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <ProgressBar done={packed} total={list.length} />
                  <span className="shrink-0 text-[13px] font-semibold text-muted">
                    {list.length === 0 ? 'Empty' : `${packed} of ${list.length} packed`}
                  </span>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </Screen>
  )
}
