import { randomUUID } from 'node:crypto'
import { aiReady, sortText, type TextVerdict } from './ai.js'
import { alertCompany } from './push.js'
import { admin, env, HttpError, jsonBody, origin, query, send, type Req, type Res } from './server.js'

/**
 * Texts to the business's Google Voice number arrive here:
 *   Google Voice → emails the owner → a Gmail filter forwards them to an
 *   inbound email service → it posts the email to
 *   /api/inbound-email?key=<INBOUND_SECRET>&company=<request page address>
 * Each text is kept (Requests → Texts), sorted (repair request or not), and
 * repair requests become requests in the inbox. Replies are never sent
 * automatically: the owner uses the ready texts.
 */

interface Attachment {
  name: string
  contentType: string
  data: string // base64
}
export interface InboundEmail {
  from: string
  subject: string
  text: string
  attachments: Attachment[]
}

type Json = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Postmark, CloudMailin (JSON) or a plain {from, subject, text, attachments} body */
export function parseInbound(body: Json): InboundEmail {
  if ('TextBody' in body || 'From' in body) {
    return {
      from: str(body.From) || str((body.FromFull as Json | undefined)?.Email),
      subject: str(body.Subject),
      text: str(body.TextBody) || str(body.StrippedTextReply) || str(body.HtmlBody).replace(/<[^>]+>/g, ' '),
      attachments: ((body.Attachments as Json[] | undefined) ?? []).map((a) => ({ name: str(a.Name), contentType: str(a.ContentType), data: str(a.Content) })),
    }
  }
  if ('plain' in body || 'envelope' in body) {
    const headers = (body.headers ?? {}) as Json
    const h = (k: string) => str(headers[k] ?? headers[k.toLowerCase()] ?? headers[k.charAt(0).toUpperCase() + k.slice(1)])
    return {
      from: h('from') || str((body.envelope as Json | undefined)?.from),
      subject: h('subject'),
      text: str(body.plain) || str(body.html).replace(/<[^>]+>/g, ' '),
      attachments: ((body.attachments as Json[] | undefined) ?? []).map((a) => ({ name: str(a.file_name), contentType: str(a.content_type), data: str(a.content) })),
    }
  }
  return {
    from: str(body.from),
    subject: str(body.subject),
    text: str(body.text),
    attachments: ((body.attachments as Json[] | undefined) ?? []).map((a) => ({ name: str(a.filename ?? a.name), contentType: str(a.contentType ?? a.content_type), data: str(a.content ?? a.data) })),
  }
}

/** The sender's phone and just the message, from a Google Voice email */
export function parseGoogleVoice(mail: InboundEmail): { phone: string; message: string } {
  // "+1 (732) 555-0101 <17325550101.17325559999.abc@txt.voice.google.com>" or "New text message from (732) 555-0101"
  const fromAddress = mail.from.match(/(\d{10,11})\.\d{10,11}\.[^@\s]*@txt\.voice\.google\.com/)
  const fromSubject = mail.subject.match(/(?:text|group) message from\s+(.+)$/i)
  const digits = (fromAddress?.[1] ?? fromSubject?.[1] ?? mail.from).replace(/\D/g, '')
  const phone = digits.length >= 10 ? digits.slice(-10) : ''
  const stop = /^(to respond to this text message|you received this|your account|help center|help forum|google llc|this email was sent|<https:\/\/voice\.google\.com)/i
  const lines: string[] = []
  for (const line of mail.text.replace(/\r/g, '').split('\n')) {
    if (stop.test(line.trim())) break
    lines.push(line)
  }
  const message = lines
    .join('\n')
    .replace(/^-+ ?Forwarded message ?-+[\s\S]*?\n\n/i, '')
    .replace(/<https?:\/\/[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { phone, message }
}

/** Without AI: simple rules (short polite replies are ignored; everything else is a request to review) */
export function ruleVerdict(message: string): TextVerdict {
  const m = message.trim().toLowerCase()
  const chatter = /^(ok(ay)?|k|thanks?( you)?|thank you( so much)?|thx|ty|great|perfect|sounds good|see you|on (my|the) way|running late|be there|got it|👍|🙏|yes|no)[.!\s]*$/i
  const ignore = m.length < 3 || chatter.test(m)
  const emergency = /(flood|leak(ing)?\b.*(ceiling|everywhere|a lot)|burst|no heat|no power|gas smell|smell(s)? gas|sparks?|fire|sewage|overflow)/i.test(m)
  return {
    is_request: !ignore,
    reason: ignore ? 'Looks like a short reply, not a repair request.' : 'Sorted by simple rules (AI is off): please review.',
    language: /[֐-׿]/.test(message) ? 'he' : 'en',
    english: message,
    issues: ignore ? [] : [{ key: 'other', label: '', text: message.slice(0, 300) }],
    address: null,
    unit: null,
    urgency: emergency ? 'emergency' : 'soon',
    name: null,
  }
}

export async function inboundEmail(req: Req, res: Res) {
  const secret = env('INBOUND_SECRET')
  if (!secret || query(req, 'key') !== secret) throw new HttpError(401, 'Not allowed.')
  const db = admin()
  const { data: settings } = await db.from('service_settings').select('company_id').eq('public_slug', query(req, 'company').toLowerCase()).maybeSingle()
  if (!settings) throw new HttpError(404, 'Unknown company (check &company= in the address).')
  const company = settings.company_id as string

  const mail = parseInbound(await jsonBody<Json>(req))
  const { phone, message } = parseGoogleVoice(mail)
  const images = mail.attachments.filter((a) => /^image\//i.test(a.contentType) && a.data).slice(0, 8)
  const { data: logged } = await db
    .from('inbound_messages')
    .insert({ company_id: company, from_phone: phone, body: message.slice(0, 5000), photo_count: images.length })
    .select('id')
    .single()

  let verdict: TextVerdict | null = null
  try {
    verdict = aiReady() ? await sortText(message, images.length) : null
  } catch (e) {
    console.error('AI sort failed', e)
  }
  verdict ??= ruleVerdict(message)
  if (!message && images.length) verdict = { ...verdict, is_request: true, reason: 'Photos only', issues: [{ key: 'other', label: '', text: 'Photo sent by text' }] }
  if (!verdict.is_request) {
    await db.from('inbound_messages').update({ verdict: 'ignored', reason: verdict.reason }).eq('id', logged?.id)
    return send(res, 200, { ok: true, request: false })
  }

  // Which house: a known tenant's phone first, then the address in the text
  const { data: tenant } = phone
    ? await db.from('tenants').select('id, name, property_id, unit_id').eq('company_id', company).eq('phone_key', phone).eq('active', true).limit(1).maybeSingle()
    : { data: null }
  let propertyId: string | null = tenant?.property_id ?? null
  let address = ''
  if (propertyId) {
    address = ((await db.from('properties').select('address').eq('id', propertyId).single()).data?.address as string) ?? ''
  } else if (verdict.address) {
    const { data: found } = await db.rpc('find_property', { company, addr: verdict.address })
    const row = found as { id: string | null; address: string } | null
    if (row?.id) {
      propertyId = row.id
      address = row.address
    } else {
      const { data: made } = await db.from('properties').insert({ company_id: company, address: verdict.address.slice(0, 200), source: 'request' }).select('id, address').single()
      propertyId = made?.id ?? null
      address = verdict.address
    }
  }
  const { data: plan } = propertyId
    ? await db.from('memberships').select('id').eq('property_id', propertyId).in('status', ['active', 'past_due']).limit(1).maybeSingle()
    : { data: null }
  const { data: house } = propertyId ? await db.from('properties').select('landlord_id').eq('id', propertyId).single() : { data: null }
  const { data: landlord } = house?.landlord_id ? await db.from('landlords').select('phone, name').eq('id', house.landlord_id).single() : { data: null }
  const fromLandlord = Boolean(landlord && phone && landlord.phone.replace(/\D/g, '').slice(-10) === phone)
  const member = Boolean(plan)
  const issues = verdict.issues.map((i) => ({ key: i.key, label: i.key === 'other' ? '' : i.label, text: i.text, tried: [] }))

  const { data: request } = await db
    .from('service_requests')
    .insert({
      company_id: company,
      property_id: propertyId,
      unit_id: tenant?.unit_id ?? null,
      address,
      unit_label: verdict.unit ?? '',
      source: 'text',
      is_member: member,
      requester_name: tenant?.name || (fromLandlord ? landlord?.name : '') || verdict.name || '',
      requester_phone: phone,
      requester_kind: fromLandlord ? 'landlord' : tenant ? 'tenant' : 'other',
      tenant_id: tenant?.id ?? null,
      verified: Boolean(tenant) || fromLandlord,
      issues,
      description: verdict.english.slice(0, 3000),
      original_text: message.slice(0, 3000),
      language: verdict.language || 'en',
      urgency: verdict.urgency,
      tenant_urgency: verdict.urgency,
      photo_needed: images.length === 0 && verdict.urgency !== 'emergency',
      address_needed: !address,
      needs_approval: member && !fromLandlord && issues.some((i) => i.key === 'other'),
    })
    .select('id, urgency')
    .single()
  if (!request) throw new Error('Could not save the request.')

  const folder = randomUUID().replace(/-/g, '')
  for (const img of images) {
    const path = `incoming/${folder}/${randomUUID()}.jpg`
    const { error } = await db.storage.from('requests').upload(path, Buffer.from(img.data, 'base64'), { contentType: img.contentType })
    if (!error) await db.from('request_photos').insert({ company_id: company, request_id: request.id, path, kind: 'issue', issue_index: 0 })
  }
  await db.from('inbound_messages').update({ verdict: 'request', reason: verdict.reason, request_id: request.id }).eq('id', logged?.id)

  if (request.urgency === 'emergency') {
    await db.from('service_requests').update({ notified_at: new Date().toISOString() }).eq('id', request.id)
    await alertCompany(company, {
      title: `🚨 Emergency text${address ? `: ${address.split(',')[0]}` : ''}`,
      body: verdict.english.slice(0, 140),
      url: `${origin(req)}/requests/${request.id}`,
      tag: `request-${request.id}`,
    })
  }
  send(res, 200, { ok: true, request: true, id: request.id })
}
