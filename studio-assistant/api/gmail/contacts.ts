import { route, json, body } from '../_lib/http.js'
import { requireUser } from '../_lib/db.js'
import { gmail, gmailToken, header, parseAddress, type GmailMessage } from '../_lib/google.js'

interface Req {
  exclude: string[]
}

// People you emailed between 6 months and 2 years ago but not since: candidates for a check-in.
export const POST = route(async (req) => {
  const owner = await requireUser(req)
  const { exclude } = await body<Req>(req)
  const token = await gmailToken(owner)
  const meta = 'format=metadata&metadataHeaders=To&metadataHeaders=Subject'
  const listIds = async (q: string, max: number) =>
    ((await gmail<{ messages?: { id: string }[] }>(owner, `messages?maxResults=${max}&q=${encodeURIComponent(q)}`, undefined, token)).messages ?? []).map(
      (m) => m.id,
    )
  const recipients = async (ids: string[]) =>
    Promise.all(ids.map((id) => gmail<GmailMessage>(owner, `messages/${id}?${meta}`, undefined, token)))

  const [recentIds, oldIds] = await Promise.all([listIds('in:sent newer_than:6m', 60), listIds('in:sent older_than:6m newer_than:2y', 40)])
  const [recent, old] = await Promise.all([recipients(recentIds), recipients(oldIds)])
  const skip = new Set([...exclude.map((e) => e.toLowerCase()), ...recent.map((m) => parseAddress(header(m, 'To')).email)])
  const seen = new Set<string>()
  const contacts = []
  for (const m of old) {
    const to = parseAddress(header(m, 'To').split(',')[0] ?? '')
    if (!to.email.includes('@') || skip.has(to.email) || seen.has(to.email) || /no-?reply|notifications?@/.test(to.email)) continue
    seen.add(to.email)
    contacts.push({
      name: to.name,
      email: to.email,
      lastContact: new Date(Number(m.internalDate)).toISOString().slice(0, 10),
      lastSubject: header(m, 'Subject'),
    })
  }
  return json({ contacts: contacts.slice(0, 10) })
})
