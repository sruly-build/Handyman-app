import { route, json, body } from '../_lib/http.js'
import { requireUser } from '../_lib/db.js'
import { reachOutDraft, replyDraft, type IncomingEmail, type Studio } from '../_lib/ai.js'

type Req =
  | { type: 'reply'; studio: Studio; email: IncomingEmail; style?: number }
  | { type: 'reachout'; studio: Studio; contact: { name: string; email: string; lastContact: string; lastSubject: string } }

export const POST = route(async (req) => {
  await requireUser(req)
  const r = await body<Req>(req)
  if (r.type === 'reply') return json({ draft: await replyDraft(r.studio, r.email, r.style ?? 0) })
  return json(await reachOutDraft(r.studio, r.contact))
})
