import { chargeApproval } from './stripe.js'
import { admin, env, HttpError, send, type Req, type Res } from './server.js'

/**
 * GET /api/cron — once a day (Vercel runs it; see vercel.json):
 * adds earned plan hours and charges approved parts that weren't charged yet.
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
  send(res, 200, { accrued, charged })
}
