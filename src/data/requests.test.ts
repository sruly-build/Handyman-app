import { describe, expect, it } from 'vitest'
import { addressKey, inboxOrder, issueSummary, milesBetween, nearbyWhenever, repeatIssues, requestFlags } from './requests'
import type { ServiceRequest } from './types'

const req = (patch: Partial<ServiceRequest>): ServiceRequest => ({
  id: crypto.randomUUID(), company_id: 'c', property_id: 'p1', unit_id: null, address: '1 Main St', unit_label: '',
  lat: null, lng: null, source: 'web', is_member: false, requester_name: 'A', requester_phone: '7325550101',
  requester_email: '', requester_kind: 'tenant', tenant_id: null, verified: false, issues: [], description: '',
  original_text: '', language: 'en', urgency: 'soon', tenant_urgency: 'soon', best_days: [], best_hours: '',
  punch_list: '', status: 'new', scheduled_at: null, done_at: null, job_id: null, needs_approval: false,
  photo_needed: false, address_needed: false, over_hour: false, status_token: 't', notified_at: null, feedback: null,
  feedback_note: '', feedback_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  ...patch,
})
const issue = (key: string) => ({ key, label: key, text: '', tried: [] })

describe('addressKey', () => {
  it('matches the same house written differently', () => {
    expect(addressKey('12 Oak Street, Lakewood, NJ 08701')).toBe('12 oak st')
    expect(addressKey('12 Oak St. Apt 2, Lakewood')).toBe('12 oak st')
    expect(addressKey('12  OAK street #B')).toBe('12 oak st')
    expect(addressKey('5 North Avenue')).toBe('5 n ave')
  })
})

describe('requestFlags', () => {
  it('flags emergencies, approvals, photos and unverified member requests', () => {
    const flags = requestFlags(req({ urgency: 'emergency', needs_approval: true, photo_needed: true, is_member: true }))
    expect(flags).toEqual(['emergency', 'needs_approval', 'photo_needed', 'unverified'])
  })
  it('a known tenant or the landlord is not unverified', () => {
    expect(requestFlags(req({ is_member: true, verified: true }))).toEqual([])
    expect(requestFlags(req({ is_member: true, requester_kind: 'landlord' }))).toEqual([])
  })
  it('flags a missing address', () => {
    expect(requestFlags(req({ address: '' }))).toContain('address_needed')
  })
})

describe('repeatIssues', () => {
  it('finds the same issue at a house enough times in a year', () => {
    const old = new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString()
    const list = [
      req({ issues: [issue('unclog')] }),
      req({ issues: [issue('unclog'), issue('door')] }),
      req({ issues: [issue('unclog')], created_at: old }),
      req({ property_id: 'p2', issues: [issue('unclog')] }),
    ]
    expect([...repeatIssues(list, 2)]).toEqual(['p1:unclog'])
    expect(repeatIssues(list, 3).size).toBe(0)
    expect(requestFlags(list[0], repeatIssues(list, 2))).toContain('repeat')
  })
})

describe('nearbyWhenever', () => {
  it('lists close-by Whenever requests nearest-next', () => {
    const here = req({ lat: 40.08, lng: -74.21 })
    const near = req({ urgency: 'whenever', lat: 40.085, lng: -74.21 })
    const nearer = req({ urgency: 'whenever', lat: 40.081, lng: -74.21 })
    const far = req({ urgency: 'whenever', lat: 40.5, lng: -74.21 })
    const soon = req({ urgency: 'soon', lat: 40.081, lng: -74.21 })
    const done = req({ urgency: 'whenever', status: 'done', lat: 40.081, lng: -74.21 })
    expect(nearbyWhenever(here, [here, near, nearer, far, soon, done], 3).map((r) => r.id)).toEqual([nearer.id, near.id])
    expect(milesBetween({ lat: 40, lng: -74 }, { lat: 41, lng: -74 })).toBeCloseTo(69.1, 0)
  })
})

describe('inbox', () => {
  it('puts emergencies first', () => {
    const a = req({ urgency: 'whenever', created_at: '2026-01-01' })
    const b = req({ urgency: 'emergency', created_at: '2026-02-01' })
    expect([a, b].sort(inboxOrder)[0]).toBe(b)
  })
  it('summarises issues', () => {
    expect(issueSummary({ issues: [issue('Door knob'), { key: 'other', label: '', text: 'Window stuck', tried: [] }], punch_list: '' })).toBe('Door knob, Window stuck')
    expect(issueSummary({ issues: [], punch_list: 'Paint hall\nFix sink' })).toBe('Paint hall')
  })
})

import { dueReminders, filterDue } from './reminders'

describe('reminders', () => {
  const house = (patch: object) => ({ id: 'h', address: '1 Main St', last_filter_at: null, filter_months: null, plan: { status: 'active' as const }, inspections: [], ...patch })
  it('works out the filter due date from the house or the company interval', () => {
    expect(filterDue({ last_filter_at: '2026-07-01', filter_months: null }, 4)).toBe('2026-11-01')
    expect(filterDue({ last_filter_at: '2026-07-01', filter_months: 2 }, 4)).toBe('2026-09-01')
    expect(filterDue({ last_filter_at: null, filter_months: 2 }, 4)).toBeNull()
  })
  it('lists due filters and the seasonal check-up for plan houses only', () => {
    const now = new Date('2026-10-10T12:00')
    const list = dueReminders(
      [house({ last_filter_at: '2026-06-01' }), house({ id: 'x', plan: null, last_filter_at: '2026-01-01' }), house({ id: 'y', last_filter_at: '2026-09-01' })],
      4,
      { winter: true, spring: true },
      now,
    )
    expect(list.filter((r) => r.kind === 'filter').map((r) => [r.houseId, r.overdue])).toEqual([['h', true]])
    expect(list.filter((r) => r.kind === 'winter').map((r) => r.houseId)).toEqual(['h', 'y'])
  })
  it('a check-up done this season clears it', () => {
    const now = new Date('2026-10-10T12:00')
    const list = dueReminders([house({ inspections: [{ kind: 'winter', done_at: '2026-09-15T10:00:00Z' }] })], 4, { winter: true, spring: true }, now)
    expect(list).toEqual([])
  })
})
