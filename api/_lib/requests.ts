import { aiReady, readList, readSticker, toEnglish } from './ai.js'
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
  // Requests written in Hebrew (or another language) get an English version
  await translateRequest(r.id).catch((e) => console.error('translate failed', e))
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

/** POST /api/read-sticker {image, mediaType} — AI reads an appliance sticker (company only) */
export async function readStickerRoute(req: Req, res: Res) {
  const me = await caller(req)
  if (!me.companyId) throw new HttpError(403, 'Not allowed.')
  const { image, mediaType } = await jsonBody<{ image?: string; mediaType?: string }>(req)
  if (!image || image.length > 7_000_000) throw new HttpError(400, 'Send one photo (under 5 MB).')
  const out = await readSticker(image, mediaType || 'image/jpeg')
  if (!out) throw new HttpError(422, "Couldn't read that sticker. Try a sharper, closer photo.")
  send(res, 200, out)
}

/** POST /api/read-list {requestId} — AI turns a pasted list or screenshot into punch list items */
export async function readListRoute(req: Req, res: Res) {
  const me = await caller(req)
  const { requestId } = await jsonBody<{ requestId?: string }>(req)
  const db = admin()
  const { data: r } = await db.from('service_requests').select('id, company_id, punch_list').eq('id', requestId ?? '').maybeSingle()
  if (!r || r.company_id !== me.companyId) throw new HttpError(403, 'Not allowed.')
  const { data: photos } = await db.from('request_photos').select('path').eq('request_id', r.id).eq('kind', 'list')
  const images: { data: string; mediaType: string }[] = []
  for (const p of (photos ?? []).slice(0, 4)) {
    const { data } = await db.storage.from('requests').download(p.path)
    if (data) images.push({ data: Buffer.from(await data.arrayBuffer()).toString('base64'), mediaType: data.type || 'image/jpeg' })
  }
  if (!r.punch_list && !images.length) return send(res, 200, { items: [] })
  const items = await readList(r.punch_list ?? '', images)
  send(res, 200, { items: items ?? [] })
}

/** Hebrew (or other) requests from the request page: keep the original, add English */
export async function translateRequest(id: string) {
  if (!aiReady()) return
  const db = admin()
  const { data: r } = await db.from('service_requests').select('id, language, description, issues, original_text').eq('id', id).single()
  if (!r || r.language === 'en' || r.original_text) return
  const issues = r.issues as { key: string; label: string; text: string; tried: string[] }[]
  const texts = [r.description ?? '', ...issues.map((i) => i.text ?? '')]
  if (!texts.some((t) => t.trim())) return
  const english = await toEnglish(texts)
  if (!english) return
  await db
    .from('service_requests')
    .update({
      original_text: [r.description, ...issues.map((i) => i.text)].filter(Boolean).join('\n'),
      description: english[0],
      issues: issues.map((i, n) => ({ ...i, text: i.text ? english[n + 1] : i.text })),
    })
    .eq('id', r.id)
}
