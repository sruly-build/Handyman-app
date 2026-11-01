import { addDays, todayISO } from '../lib/dates'
import type { CallOutcome, FollowUp, Interest, OrgType, ProspectStage, ProspectView } from './types'

export const stageOrder: ProspectStage[] = [
  'new',
  'contacted',
  'follow_up',
  'interested',
  'meeting',
  'proposal',
  'converted',
  'not_interested',
]

export const stageLabels: Record<ProspectStage, string> = {
  new: 'New lead',
  contacted: 'Contacted',
  follow_up: 'Follow-up needed',
  interested: 'Interested',
  meeting: 'Meeting scheduled',
  proposal: 'Proposal / opportunity',
  converted: 'Customer',
  not_interested: 'Not interested',
}

export const outcomeLabels: Record<CallOutcome, string> = {
  no_answer: 'No answer',
  voicemail: 'Left voicemail',
  call_back: 'Call back later',
  interested: 'Interested',
  meeting: 'Meeting scheduled',
  not_interested: 'Not interested',
}

export const orgTypeLabels: Record<OrgType, string> = {
  landlord: 'Landlord',
  property_manager: 'Property manager',
  investor: 'Investor',
  apartment_owner: 'Apartment owner',
  other: 'Other',
}

export const interestLabels: Record<Interest, string> = {
  unknown: 'Not sure yet',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

/** Leads we're still working (not customers, not "not interested", not archived) */
export const isOpen = (p: Pick<ProspectView, 'stage' | 'archived_at'>) =>
  !p.archived_at && p.stage !== 'converted' && p.stage !== 'not_interested'

/**
 * The stage after a call. Never moves a lead backwards from a proposal (only
 * "not interested" can), and a new lead becomes at least "contacted".
 */
export function stageAfterCall(current: ProspectStage, outcome: CallOutcome, followUpSet: boolean): ProspectStage {
  if (current === 'converted') return current
  if (outcome === 'not_interested') return 'not_interested'
  if (outcome === 'meeting') return current === 'proposal' ? current : 'meeting'
  if (outcome === 'interested') return ['meeting', 'proposal'].includes(current) ? current : 'interested'
  if (['interested', 'meeting', 'proposal'].includes(current)) return current
  if (outcome === 'call_back' || followUpSet) return 'follow_up'
  return current === 'new' || current === 'not_interested' ? 'contacted' : current
}

const digits = (phone: string) => phone.replace(/\D/g, '').slice(-10)
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Leads that look like the same person: same phone, same email, or same name at the same company */
export function findDuplicates(
  list: ProspectView[],
  input: { name: string; phone: string; email: string; org_name: string },
  ignoreId?: string,
): ProspectView[] {
  return list.filter((p) => {
    if (p.id === ignoreId) return false
    if (input.phone && digits(input.phone).length >= 7 && digits(p.phone) === digits(input.phone)) return true
    if (input.email.trim() && same(p.email, input.email)) return true
    return Boolean(input.name.trim()) && same(p.name, input.name) && same(p.org?.name ?? '', input.org_name)
  })
}

export type FollowUpTiming = 'overdue' | 'today' | 'upcoming'

/** Is a follow-up overdue (its time has passed), later today, or on a later day? */
export function followUpTiming(f: Pick<FollowUp, 'due_at'>, now = new Date()): FollowUpTiming {
  if (Date.parse(f.due_at) < now.getTime()) return 'overdue'
  return todayISO(new Date(f.due_at)) === todayISO(now) ? 'today' : 'upcoming'
}

export interface QueueEntry {
  lead: ProspectView
  reason: 'overdue' | 'today' | 'new'
}

/**
 * Who to call, in order: overdue follow-ups (oldest first), today's follow-ups
 * (by time), then new leads never contacted (mine first, then unassigned).
 * Meetings aren't calls, so they're left out.
 */
export function callQueue(leads: ProspectView[], me: string, now = new Date()): QueueEntry[] {
  const open = leads.filter(isOpen)
  const calls = open
    .filter((l) => l.follow_up && l.follow_up.kind === 'call' && followUpTiming(l.follow_up, now) !== 'upcoming')
    .sort((a, b) => a.follow_up!.due_at.localeCompare(b.follow_up!.due_at))
    .map((lead) => ({ lead, reason: followUpTiming(lead.follow_up!, now) as 'overdue' | 'today' }))
  const rank = (l: ProspectView) => (l.assigned_to === me ? 0 : l.assigned_to === null ? 1 : 2)
  const fresh = open
    .filter((l) => l.stage === 'new' && !l.last_contacted_at && !l.follow_up)
    .sort((a, b) => rank(a) - rank(b) || a.created_at.localeCompare(b.created_at))
    .map((lead) => ({ lead, reason: 'new' as const }))
  return [...calls.filter((c) => c.reason === 'overdue'), ...calls.filter((c) => c.reason === 'today'), ...fresh]
}

/** One-tap follow-up dates: tomorrow, the weekdays after it (by name), and next week */
export function quickDates(now = new Date()): { label: string; date: string }[] {
  const today = todayISO(now)
  const options = [{ label: 'Tomorrow', date: addDays(today, 1) }]
  for (let i = 2; i <= 6; i++) {
    const date = addDays(today, i)
    const [y, m, d] = date.split('-').map(Number)
    const day = new Date(y, m - 1, d)
    if (day.getDay() === 0 || day.getDay() === 6) continue
    options.push({ label: day.toLocaleDateString(undefined, { weekday: 'short' }), date })
  }
  options.push({ label: 'Next week', date: addDays(today, 7) })
  return options
}
