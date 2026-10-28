import type { Job } from '../data/types'

const pad = (n: number) => String(n).padStart(2, '0')
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

/**
 * A calendar event for the job day with an alert at 7pm the night before,
 * reminding you to load the van. iPhone opens it straight in Calendar.
 */
export function bringReminderIcs(job: Job, link: string, now = new Date()): string {
  if (!job.job_date) throw new Error('Give the job a date first.')
  const [y, m, d] = job.job_date.split('-').map(Number)
  const next = new Date(y, m - 1, d + 1)
  const day = (dt: Date) => `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}`
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Handyman app//EN',
    'BEGIN:VEVENT',
    `UID:job-${job.id}@handyman-app`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day(new Date(y, m - 1, d))}`,
    `DTEND;VALUE=DATE:${day(next)}`,
    `SUMMARY:${escape(`Job: ${job.customer_name}`)}`,
    job.address ? `LOCATION:${escape(job.address)}` : '',
    `DESCRIPTION:${escape(`Bring list: ${link}`)}`,
    `URL:${link}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escape(`Load the van for ${job.customer_name} tomorrow`)}`,
    // All-day events start at midnight, so 5 hours before = 7pm the night before
    'TRIGGER:-PT5H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
