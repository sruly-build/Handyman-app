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

describe('planned punch items', () => {
  const job = (id: string, patch = {}) => ({ id, customer_name: 'A', customer_phone: '', customer_email: '', address: '1 Main', job_date: null, notes: '', company_id: 'c', created_by: null, bring_extras: [], created_at: '', ...patch })
  const item = (id: string, job_id: string, planned_date: string | null, status: 'todo' | 'done' = 'todo') => ({ id, job_id, title: id, status, planned_date, position: 0 })
  it('groups the items planned for a day per job, skips done ones and days the job is already booked', () => {
    const events = scheduleEvents(
      [job('j1'), job('j2', { job_date: '2026-11-20' })],
      [],
      [item('a', 'j1', '2026-11-18'), item('b', 'j1', '2026-11-18'), item('c', 'j1', '2026-11-19', 'done'), item('d', 'j2', '2026-11-20'), item('e', 'j2', '2026-11-21')],
    )
    const items = events.filter((e) => e.kind === 'items')
    expect(items.map((e) => [e.job.id, e.date, e.items!.map((i) => i.id).join()])).toEqual([
      ['j1', '2026-11-18', 'a,b'],
      ['j2', '2026-11-21', 'e'],
    ])
  })
})
