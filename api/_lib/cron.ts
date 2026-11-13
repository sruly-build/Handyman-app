import { alertCompany } from './push.js'
import { chargeApproval } from './stripe.js'
import { admin, env, HttpError, send, type Req, type Res } from './server.js'

/**
 * GET /api/cron — once a day (Vercel runs it; see vercel.json):
 * adds earned plan hours, charges approved parts that weren't charged yet,
 * and alerts the owner's phone about HVAC filters due today at plan houses.
 */
export async function cron(req: Req, res: Res) {
  const secret = env('CRON_SECRET')
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) throw new HttpError(401, 'Not allowed.')
  const db = admin()
  const { data: accrued, error } = await db.rpc('accrue_all_hours')
  if (error) throw new Error(error.message)
  let charged = 0
  if (env('STRIPE_SECRET_KEY')) {
    const { data: pending } = await db.from('approvals').select('id').eq('kind', 'parts').eq('status', 'approved').eq('charge_status', 'pending').limit(50)
    for (const a of pending ?? []) if ((await chargeApproval(a.id)) === 'charged') charged++
  }
  const reminded = await filterAlerts(db)
  send(res, 200, { accrued, charged, reminded })
}

/** Phone alert: plan houses whose HVAC filter is due today */
async function filterAlerts(db: ReturnType<typeof admin>): Promise<number> {
  const { data: plans } = await db.from('memberships').select('property_id').eq('status', 'active')
  const ids = (plans ?? []).map((m) => m.property_id as string)
  if (!ids.length) return 0
  const { data: houses } = await db.from('properties').select('id, company_id, address, last_filter_at, filter_months').in('id', ids).not('last_filter_at', 'is', null)
  const { data: settings } = await db.from('service_settings').select('company_id, filter_months')
  const months = new Map((settings ?? []).map((s) => [s.company_id as string, Number(s.filter_months) || 4]))
  const today = new Date().toISOString().slice(0, 10)
  const due = new Map<string, string[]>()
  for (const h of houses ?? []) {
    const d = new Date(`${h.last_filter_at}T12:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + (h.filter_months ?? months.get(h.company_id) ?? 4))
    if (d.toISOString().slice(0, 10) === today) due.set(h.company_id, [...(due.get(h.company_id) ?? []), String(h.address).split(',')[0]])
  }
  let sent = 0
  for (const [company, streets] of due) {
    sent += await alertCompany(company, { title: `HVAC filter due today (${streets.length})`, body: streets.join(', '), url: '/requests', tag: `filters-${today}` })
  }
  return sent
}
