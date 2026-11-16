import type { ApprovalPrefs } from './types'

export const defaultApprovalPrefs: ApprovalPrefs = {
  mode: 'over',
  limit: 150,
  monthly_budget: null,
  emergency_limit: 300,
  turnover_estimate: true,
  contact: 'text',
  note: '',
}

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`

/** The "go ahead without asking" amount these rules mean (stored as the landlord's auto-approve limit) */
export function autoLimitOf(p: ApprovalPrefs): number {
  return p.mode === 'always' ? 0 : p.mode === 'never' ? 1_000_000 : Math.max(0, p.limit)
}

/**
 * Should this work be approved without asking the landlord?
 * spentThisMonth: approved work for this landlord so far this month.
 */
export function decideApproval(
  p: ApprovalPrefs,
  amount: number,
  opts: { emergency?: boolean; spentThisMonth?: number } = {},
): { auto: boolean; reason: string } {
  const spent = opts.spentThisMonth ?? 0
  if (p.monthly_budget != null && spent + amount > p.monthly_budget) {
    return { auto: false, reason: `Over the ${money(p.monthly_budget)} monthly budget` }
  }
  if (opts.emergency && p.emergency_limit != null && amount <= p.emergency_limit) {
    return { auto: true, reason: `Emergency under ${money(p.emergency_limit)}` }
  }
  if (p.mode === 'never') return { auto: true, reason: 'Landlord said: just fix it' }
  if (p.mode === 'always') return { auto: false, reason: 'Landlord approves every job' }
  return amount <= p.limit
    ? { auto: true, reason: `Under the ${money(p.limit)} limit` }
    : { auto: false, reason: `Over the ${money(p.limit)} limit` }
}

/** Short plain-English lines describing the rules */
export function describeApprovalPrefs(p: ApprovalPrefs): string[] {
  const lines = [
    p.mode === 'always' ? 'Ask before every job' : p.mode === 'never' ? "Just fix it, don't ask" : `Ask only for jobs over ${money(p.limit)}`,
  ]
  if (p.emergency_limit != null) lines.push(`Emergencies: go ahead up to ${money(p.emergency_limit)}`)
  if (p.monthly_budget != null) lines.push(`Monthly budget: ${money(p.monthly_budget)}`)
  if (p.turnover_estimate) lines.push('Turnovers: send one estimate first')
  lines.push(`Send approvals by ${p.contact === 'whatsapp' ? 'WhatsApp' : p.contact}`)
  if (p.note.trim()) lines.push(`Note: ${p.note.trim()}`)
  return lines
}

/** Clean up whatever was saved (old or partial rules get the defaults) */
export function normalizeApprovalPrefs(raw: unknown): ApprovalPrefs | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<ApprovalPrefs>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
  return {
    mode: r.mode === 'always' || r.mode === 'never' ? r.mode : 'over',
    limit: num(r.limit) ?? defaultApprovalPrefs.limit,
    monthly_budget: num(r.monthly_budget),
    emergency_limit: num(r.emergency_limit),
    turnover_estimate: r.turnover_estimate !== false,
    contact: r.contact === 'whatsapp' || r.contact === 'email' ? r.contact : 'text',
    note: typeof r.note === 'string' ? r.note.slice(0, 500) : '',
  }
}
