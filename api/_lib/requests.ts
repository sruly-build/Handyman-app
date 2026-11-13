import { alertCompany } from './push.js'
import { admin, caller, HttpError, jsonBody, origin, query, send, type Req, type Res } from './server.js'

/**
 * POST /api/request-received {token}
 * The request page calls this right after a request is saved. For an
 * emergency, every phone with alerts on gets a loud alert. Safe to call more
 * than once: each request alerts only once.
 */
export async function requestReceived(req: Req, res: Res) {
  const { token } = await jsonBody<{ token?: string }>(req)
  if (!token || !/^[0-9a-f]{64}$/.test(token)) throw new HttpError(400, 'Bad link.')
  const db = admin()
  const { data: r } = await db
    .from('service_requests')
    .select('id, company_id, urgency, address, unit_label, issues, notified_at, is_member')
    .eq('status_token', token)
    .maybeSingle()
  if (!r) throw new HttpError(404, 'Not found.')
  if (r.urgency !== 'emergency' || r.notified_at) return send(res, 200, { alerted: 0 })
  // Mark first, so two calls can't both alert
  const { data: claimed } = await db
    .from('service_requests')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', r.id)
    .is('notified_at', null)
    .select('id')
  if (!claimed?.length) return send(res, 200, { alerted: 0 })
  const issues = (r.issues as { label?: string; text?: string }[]).map((i) => i.label || i.text).filter(Boolean).join(', ')
  const alerted = await alertCompany(r.company_id, {
    title: `🚨 Emergency: ${String(r.address).split(',')[0]}${r.unit_label ? ` · ${r.unit_label}` : ''}`,
    body: `${issues || 'Repair request'}${r.is_member ? ' · On the plan' : ''}`,
    url: `${origin(req)}/requests/${r.id}`,
    tag: `request-${r.id}`,
  })
  send(res, 200, { alerted })
}

/** POST /api/test-alert — send a test alert to the caller's own phones */
export async function testAlert(req: Req, res: Res) {
  const me = await caller(req)
  if (!me.companyId) throw new HttpError(403, 'Not allowed.')
  const sent = await alertCompany(
    me.companyId,
    { title: '🚨 Test alert', body: 'Emergency alerts work on this phone.', url: `${origin(req)}/requests`, tag: 'test' },
    me.id,
  )
  send(res, 200, { sent })
}

/**
 * GET /api/approval-photos?token=… — the photos for a landlord's approval
 * link (short-lived links, only for that one request)
 */
export async function approvalPhotos(req: Req, res: Res) {
  const token = query(req, 'token')
  if (!/^[0-9a-f]{64}$/.test(token)) throw new HttpError(400, 'Bad link.')
  const db = admin()
  const { data: a } = await db.from('approvals').select('request_id, expires_at, status').eq('token', token).maybeSingle()
  if (!a?.request_id || Date.parse(a.expires_at) < Date.now()) return send(res, 200, { urls: [] })
  const { data: photos } = await db.from('request_photos').select('path').eq('request_id', a.request_id).neq('kind', 'list')
  const paths = (photos ?? []).map((p) => p.path as string)
  if (!paths.length) return send(res, 200, { urls: [] })
  const { data: signed } = await db.storage.from('requests').createSignedUrls(paths, 60 * 60)
  send(res, 200, { urls: (signed ?? []).map((s) => s.signedUrl).filter(Boolean) })
}
