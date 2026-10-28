import { describe, expect, it } from 'vitest'
import { sortJobs, summarize } from './summary'
import type { Job } from './types'

const job = (id: string, job_date: string | null, created_at = '2026-01-01T00:00:00Z'): Job => ({
  id,
  job_date,
  created_at,
  customer_name: id,
  customer_phone: '',
  customer_email: '',
  address: '',
  notes: '',
  assigned: [],
  bring_extras: [],
})

describe('summarize', () => {
  it('counts items by status', () => {
    const s = summarize(job('a', null), ['done', 'todo', 'in_progress', 'done'])
    expect(s).toMatchObject({ item_count: 4, done_count: 2, in_progress_count: 1 })
  })
})

describe('sortJobs', () => {
  it('puts upcoming first (soonest first), then unscheduled, then past (newest first)', () => {
    const jobs = [
      job('past-old', '2026-09-01'),
      job('none', null),
      job('later', '2026-11-20'),
      job('today', '2026-10-27'),
      job('past-recent', '2026-10-20'),
    ]
    expect(sortJobs(jobs, '2026-10-27').map((j) => j.id)).toEqual(['today', 'later', 'none', 'past-recent', 'past-old'])
  })
})
