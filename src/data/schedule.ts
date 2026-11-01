import { addDays, localParts } from '../lib/dates'
import type { FollowUp, Job, ProspectView } from './types'

/** One thing on the schedule: a walkthrough for a lead, a job, or a sales meeting */
export interface ScheduleEvent {
  key: string
  kind: 'walkthrough' | 'job' | 'meeting'
  /** For a meeting: the sales lead's name, phone and the meeting place */
  job: Pick<Job, 'id' | 'customer_name' | 'customer_phone' | 'address'>
  /** Where tapping "Open" goes */
  link: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM, or null for a job with no start time (all day) */
  time: string | null
}

/** Walkthroughs of open leads and dated jobs, in time order (all-day jobs first each day) */
export function scheduleEvents(
  all: Job[],
  meetings: { meeting: FollowUp; lead: ProspectView }[] = [],
): ScheduleEvent[] {
  const events: ScheduleEvent[] = []
  for (const job of all) {
    if (job.stage === 'lead') {
      const open = job.lead_status !== 'lost' && job.lead_status !== 'won'
      if (open && job.walkthrough_at) {
        const { date, time } = localParts(job.walkthrough_at)
        events.push({ key: `w-${job.id}`, kind: 'walkthrough', job, link: `/jobs/${job.id}`, date, time })
      }
    } else if (job.job_date) {
      events.push({
        key: `j-${job.id}`,
        kind: 'job',
        job,
        link: `/jobs/${job.id}`,
        date: job.job_date,
        time: job.job_time?.slice(0, 5) || null,
      })
    }
  }
  for (const { meeting, lead } of meetings) {
    const { date, time } = localParts(meeting.due_at)
    events.push({
      key: `m-${meeting.id}`,
      kind: 'meeting',
      job: {
        id: lead.id,
        customer_name: lead.org ? `${lead.name} · ${lead.org.name}` : lead.name,
        customer_phone: lead.phone,
        address: meeting.location,
      },
      link: `/sales/leads/${lead.id}`,
      date,
      time,
    })
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
}

/** The 7 days (Monday to Sunday) of the week a date falls in */
export function weekOf(date: string): string[] {
  const [y, m, d] = date.split('-').map(Number)
  const monday = addDays(date, -((new Date(y, m - 1, d).getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}
