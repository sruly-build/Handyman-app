import { route, json, body } from '../_lib/http.js'
import { requireUser } from '../_lib/db.js'
import { gmail, gmailToken, header, parseAddress, textOf, type GmailMessage } from '../_lib/google.js'
import { triage, type Studio } from '../_lib/ai.js'
import { hasEnv } from '../_lib/http.js'

interface Req {
  known: string[]
  clients: string[]
  studio: Studio
}

// New inbox emails from the last week, sorted by the AI into important ones and leads.
export const POST = route(async (req) => {
  const owner = await requireUser(req)
  const { known, clients, studio } = await body<Req>(req)
  const token = await gmailToken(owner)
  const list = await gmail<{ messages?: { id: string }[] }>(
    owner,
    `messages?maxResults=25&q=${encodeURIComponent('in:inbox newer_than:7d -category:promotions -category:social')}`,
    undefined,
    token,
  )
  const seen = new Set(known)
  const ids = (list.messages ?? []).map((m) => m.id).filter((id) => !seen.has(id)).slice(0, 15)
  const messages = await Promise.all(ids.map((id) => gmail<GmailMessage>(owner, `messages/${id}?format=full`, undefined, token)))
  const emails = messages.map((m) => {
    const from = parseAddress(header(m, 'From'))
    return {
      id: m.id,
      threadId: m.threadId,
      messageId: header(m, 'Message-ID'),
      from: from.name,
      fromEmail: from.email,
      subject: header(m, 'Subject') || '(no subject)',
      body: textOf(m),
      receivedAt: Number(m.internalDate),
    }
  })
  // Without an AI key every email is kept, with Gmail's snippet as its summary
  const sorted = hasEnv('ANTHROPIC_API_KEY')
    ? await triage(studio, emails, clients)
    : emails.map((e) => ({ id: e.id, important: true, isLead: false, summary: e.body.slice(0, 110) }))
  const byId = new Map(sorted.map((s) => [s.id, s]))
  return json({
    checked: ids,
    emails: emails
      .filter((e) => byId.get(e.id)?.important !== false)
      .map((e) => ({ ...e, summary: byId.get(e.id)?.summary ?? '', isLead: byId.get(e.id)?.isLead ?? false })),
  })
})
