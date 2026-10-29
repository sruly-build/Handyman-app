import { describe, expect, it } from 'vitest'
import { scheduleEvents, weekOf } from './schedule'
import type { Job } from './types'

const job = (patch: Partial<Job>): Job => ({
  id: Math.random().toString(),
  customer_name: 'X',
  customer_phone: '',
  customer_email: '',
  address: '',
  job_date: null,
  notes: '',
  company_id: 'c',
  created_by: 'u',
  bring_extras: [],
  created_at: '',
  ...patch,
})

describe('scheduleEvents', () => {
  it('shows walkthroughs of open leads at their time, and dated jobs', () => {
    const at = new Date(2026, 9, 30, 10, 15).toISOString()
    const events = scheduleEvents([
      job({ id: 'lead', stage: 'lead', lead_status: 'walkthrough_booked', walkthrough_at: at }),
      job({ id: 'lost', stage: 'lead', lead_status: 'lost', walkthrough_at: at }),
      job({ id: 'nobook', stage: 'lead', lead_status: 'new' }),
      job({ id: 'timed', job_date: '2026-10-30', job_time: '08:00:00' }),
      job({ id: 'allday', job_date: '2026-10-30' }),
      job({ id: 'nodate' }),
    ])
    expect(events.map((e) => [e.job.id, e.kind, e.date, e.time])).toEqual([
      ['allday', 'job', '2026-10-30', null],
      ['timed', 'job', '2026-10-30', '08:00'],
      ['lead', 'walkthrough', '2026-10-30', '10:15'],
    ])
  })
})

describe('weekOf', () => {
  it('runs Monday to Sunday', () => {
    expect(weekOf('2026-10-29')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ])
    expect(weekOf('2026-11-01')[0]).toBe('2026-10-26')
  })
})
