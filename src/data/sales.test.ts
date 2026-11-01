import { describe, expect, it } from 'vitest'
import { callQueue, findDuplicates, followUpTiming, quickDates, stageAfterCall } from './sales'
import type { FollowUp, ProspectView } from './types'

const lead = (patch: Partial<ProspectView>): ProspectView => ({
  id: Math.random().toString(),
  company_id: 'c',
  org_id: null,
  name: 'Pat',
  phone: '',
  email: '',
  known_by: [],
  mutual: false,
  cold: false,
  how_known: '',
  assigned_to: null,
  stage: 'new',
  interest: 'unknown',
  notes: '',
  project_notes: '',
  last_contacted_at: null,
  last_contacted_by: null,
  archived_at: null,
  client_id: null,
  source: 'personal',
  created_by: null,
  created_at: '2026-10-01T00:00:00Z',
  org: null,
  follow_up: null,
  ...patch,
})
const fu = (due: Date, kind: 'call' | 'meeting' = 'call'): FollowUp => ({
  id: 'f',
  company_id: 'c',
  prospect_id: 'p',
  kind,
  due_at: due.toISOString(),
  note: '',
  location: '',
  done_at: null,
  done_by: null,
  created_by: null,
  created_at: '',
})

describe('stageAfterCall', () => {
  it('moves a new lead along on any call', () => {
    expect(stageAfterCall('new', 'no_answer', false)).toBe('contacted')
    expect(stageAfterCall('new', 'voicemail', true)).toBe('follow_up')
    expect(stageAfterCall('contacted', 'call_back', true)).toBe('follow_up')
  })
  it('follows clear results', () => {
    expect(stageAfterCall('follow_up', 'interested', false)).toBe('interested')
    expect(stageAfterCall('interested', 'meeting', true)).toBe('meeting')
    expect(stageAfterCall('meeting', 'not_interested', false)).toBe('not_interested')
  })
  it('never moves backwards from a meeting or proposal on an unanswered call', () => {
    expect(stageAfterCall('proposal', 'no_answer', true)).toBe('proposal')
    expect(stageAfterCall('meeting', 'interested', false)).toBe('meeting')
    expect(stageAfterCall('converted', 'not_interested', false)).toBe('converted')
  })
})

describe('findDuplicates', () => {
  const list = [lead({ id: 'a', name: 'Pat Manager', phone: '(732) 555-1000', email: 'pat@acme.com', org: { name: 'Acme PM' } as never })]
  it('matches the same phone, email, or name at the same company', () => {
    expect(findDuplicates(list, { name: 'X', phone: '1-732-555-1000', email: '', org_name: '' })).toHaveLength(1)
    expect(findDuplicates(list, { name: 'X', phone: '', email: 'PAT@acme.com ', org_name: '' })).toHaveLength(1)
    expect(findDuplicates(list, { name: 'pat manager', phone: '', email: '', org_name: 'acme pm' })).toHaveLength(1)
  })
  it('does not flag different people or the lead itself', () => {
    expect(findDuplicates(list, { name: 'Pat Manager', phone: '', email: '', org_name: 'Other Co' })).toHaveLength(0)
    expect(findDuplicates(list, { name: 'Pat Manager', phone: '(732) 555-1000', email: '', org_name: '' }, 'a')).toHaveLength(0)
  })
})

describe('callQueue', () => {
  const now = new Date(2026, 10, 2, 12, 0)
  it('puts overdue first, then today, then new leads (mine before others)', () => {
    const overdue = lead({ id: 'overdue', stage: 'follow_up', follow_up: fu(new Date(2026, 10, 1, 9)) })
    const today = lead({ id: 'today', stage: 'follow_up', follow_up: fu(new Date(2026, 10, 2, 15)) })
    const later = lead({ id: 'later', stage: 'follow_up', follow_up: fu(new Date(2026, 10, 5, 9)) })
    const meeting = lead({ id: 'meeting', stage: 'meeting', follow_up: fu(new Date(2026, 10, 2, 9), 'meeting') })
    const mine = lead({ id: 'mine', assigned_to: 'me' })
    const theirs = lead({ id: 'theirs', assigned_to: 'partner' })
    const nobody = lead({ id: 'nobody' })
    const lost = lead({ id: 'lost', stage: 'not_interested' })
    const archived = lead({ id: 'archived', archived_at: '2026-10-02' })
    const q = callQueue([theirs, later, nobody, today, meeting, mine, overdue, lost, archived], 'me', now)
    expect(q.map((e) => e.lead.id)).toEqual(['overdue', 'today', 'mine', 'nobody', 'theirs'])
    expect(q[0].reason).toBe('overdue')
  })
})

describe('follow-up timing and quick dates', () => {
  const now = new Date(2026, 10, 2, 12, 0) // Monday
  it('knows overdue, today and upcoming', () => {
    expect(followUpTiming(fu(new Date(2026, 10, 2, 9)), now)).toBe('overdue')
    expect(followUpTiming(fu(new Date(2026, 10, 2, 16)), now)).toBe('today')
    expect(followUpTiming(fu(new Date(2026, 10, 3, 9)), now)).toBe('upcoming')
  })
  it('offers tomorrow, the weekdays after it, and next week, each day once', () => {
    // Monday: Tue, then Wed Thu Fri (no weekend), then next Monday
    expect(quickDates(now).map((x) => x.date)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09'])
    // Sunday: Mon, then Tue to Fri, then next Sunday
    const sunday = quickDates(new Date(2026, 10, 1, 12)).map((x) => x.date)
    expect(sunday).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-08'])
    expect(new Set(sunday).size).toBe(sunday.length)
  })
})
