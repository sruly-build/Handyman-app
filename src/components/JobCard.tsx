import { Link } from 'react-router-dom'
import type { JobSummary } from '../data/types'
import { sharing } from '../data/summary'
import { useUser } from '../lib/auth'
import { friendlyDate } from '../lib/dates'
import { CalendarIcon, ChevronIcon, PeopleIcon, PinIcon } from './Icons'
import { Card, ProgressBar } from './ui'

export function JobCard({ job }: { job: JobSummary }) {
  const allDone = job.item_count > 0 && job.done_count === job.item_count
  const { mine, sharedWith } = sharing(job, useUser().id)
  const shared = !mine || sharedWith.length > 0
  return (
    <Link to={`/jobs/${job.id}`} className="block transition active:scale-[0.98]">
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[19px] font-semibold">
              <span className="truncate">{job.customer_name}</span>
              {shared && (
                <span
                  className="flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[12px] font-semibold text-brand-dark"
                  title={mine ? 'You shared this job' : 'Shared with you'}
                >
                  <PeopleIcon size={13} strokeWidth={2.4} />
                  {mine ? 'Shared' : 'Shared with you'}
                </span>
              )}
              {job.on_site.length > 0 && (
                <span className="shrink-0 rounded-full bg-progress-soft px-2 py-0.5 text-[12px] font-semibold text-[#c26a00]">
                  On site
                </span>
              )}
            </p>
            {job.address && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-[15px] text-muted">
                <PinIcon size={15} className="shrink-0" />
                <span className="truncate">{job.address}</span>
              </p>
            )}
            <p className="mt-0.5 flex items-center gap-1 text-[15px] text-muted">
              <CalendarIcon size={15} className="shrink-0" />
              {friendlyDate(job.job_date)}
            </p>
          </div>
          <ChevronIcon size={20} className="mt-1 shrink-0 text-[#c7c7cc]" />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <ProgressBar done={job.done_count} total={job.item_count} />
          <span className={`shrink-0 text-[13px] font-semibold ${allDone ? 'text-brand' : 'text-muted'}`}>
            {job.item_count === 0 ? 'No items' : `${job.done_count} of ${job.item_count} done`}
          </span>
        </div>
      </Card>
    </Link>
  )
}
