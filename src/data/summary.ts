import type { ItemStatus, Job, JobSummary } from './types'

export function summarize(job: Job, statuses: ItemStatus[], onSite: string[] = []): JobSummary {
  return {
    ...job,
    item_count: statuses.length,
    done_count: statuses.filter((s) => s === 'done').length,
    in_progress_count: statuses.filter((s) => s === 'in_progress').length,
    on_site: [...new Set(onSite)],
  }
}

/** Upcoming jobs first (soonest at top), then unscheduled, then past jobs (most recent first). */
export function sortJobs<T extends Job>(jobs: T[], today: string): T[] {
  const rank = (j: Job) => (j.job_date === null ? 1 : j.job_date >= today ? 0 : 2)
  return [...jobs].sort((a, b) => {
    const r = rank(a) - rank(b)
    if (r !== 0) return r
    if (a.job_date && b.job_date && a.job_date !== b.job_date) {
      return rank(a) === 0 ? a.job_date.localeCompare(b.job_date) : b.job_date.localeCompare(a.job_date)
    }
    return b.created_at.localeCompare(a.created_at)
  })
}

/** How a job is shared, from the point of view of the person using the phone */
export function sharing(job: Job, me: string): { mine: boolean; sharedWith: string[] } {
  const mine = !job.created_by || job.created_by === me
  return { mine, sharedWith: (job.assigned ?? []).filter((id) => id !== job.created_by) }
}
