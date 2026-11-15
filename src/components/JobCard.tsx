import { Link } from 'react-router-dom'
import type { JobSummary } from '../data/types'
import { friendlyDate, todayISO } from '../lib/dates'
import { CalendarIcon, ChevronIcon, PeopleIcon, PinIcon } from './Icons'
import { Card, ProgressBar } from './ui'

export function JobCard({ job }: { job: JobSummary }) {
  const allDone = job.item_count > 0 && job.done_count === job.item_count
  const fromOther = job.from_company !== null
  const shared = fromOther || job.shared_with.length > 0
  const today = todayISO()
  const when = !job.job_date ? 'none' : job.job_date === today ? 'today' : job.job_date > today ? 'soon' : allDone ? 'past' : 'late'
  const stripe = { today: 'bg-brand', soon: 'bg-sky', late: 'bg-sun', past: 'bg-[#aab4b0]', none: 'bg-[#cfd6d3]' }[when]
  const dateStyle = {
    today: 'bg-brand-soft text-brand-dark',
    soon: 'bg-sky-soft text-sky',
    late: 'bg-sun-soft text-[#a35a00]',
    past: 'bg-canvas text-muted',
    none: 'bg-canvas text-muted',
  }[when]
  return (
    <Link to={`/jobs/${job.id}`} className="block transition active:scale-[0.98]">
      <Card className="relative overflow-hidden p-4 pl-5">
        <span className={`absolute inset-y-0 left-0 w-1.5 ${stripe}`} aria-hidden="true" />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[19px] font-semibold">
              <span className="truncate">{job.customer_name}</span>
              {shared && (
                <PeopleIcon
                  size={15}
                  className="shrink-0 text-[#aeaeb2]"
                  aria-label={
                    fromOther ? `Shared with you by ${job.from_company}` : `Shared with ${job.shared_with.join(', ')}`
                  }
                />
              )}
              {job.on_site.length > 0 && (
                <span className="shrink-0 rounded-full bg-progress-soft px-2 py-0.5 text-[12px] font-semibold text-[#c26a00]">
                  On site
                </span>
              )}
            </p>
            {job.address && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-[15px] text-muted">
                <PinIcon size={15} className="shrink-0 text-rose" />
                <span className="truncate">{job.address}</span>
              </p>
            )}
            <p className="mt-1.5">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-semibold ${dateStyle}`}>
                <CalendarIcon size={13} className="shrink-0" />
                {friendlyDate(job.job_date)}
                {when === 'late' ? ' · not done' : ''}
              </span>
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
