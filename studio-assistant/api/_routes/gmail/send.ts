import { route, json, body, HttpError } from '../../_lib/http.js'
import { requireUser } from '../../_lib/db.js'
import { sendEmail } from '../../_lib/google.js'

interface Req {
  to: string
  subject: string
  text: string
  threadId?: string
  inReplyTo?: string
}

export const POST = route(async (req) => {
  const owner = await requireUser(req)
  const m = await body<Req>(req)
  if (!m.to || !/@/.test(m.to)) throw new HttpError(400, 'This contact has no email address.')
  await sendEmail(owner, m)
  return json({ ok: true })
})
