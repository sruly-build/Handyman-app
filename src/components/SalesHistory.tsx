import { Link } from 'react-router-dom'
import { useActivities, usePeopleNames, useProspects } from '../data/queries'
import { outcomeLabels } from '../data/sales'
import type { Contact, ProspectView } from '../data/types'
import { useUser } from '../lib/auth'
import { Card, Divider, GroupLabel } from './ui'

/** On a customer's page: the calls and notes from when they were a sales lead */
export function SalesHistory({ client }: { client: Contact }) {
  const { data: leads = [] } = useProspects()
  const mine = leads.filter((l) => l.client_id === client.id)
  if (mine.length === 0) return null
  return (
    <section className="mb-6">
      <GroupLabel>Sales history</GroupLabel>
      {mine.map((l) => (
        <LeadHistory key={l.id} lead={l} />
      ))}
    </section>
  )
}

function LeadHistory({ lead }: { lead: ProspectView }) {
  const { data: activities = [] } = useActivities(lead.id)
  const nameOf = usePeopleNames()
  const user = useUser()
  const shown = activities.filter((a) => a.kind === 'call' || a.kind === 'note' || a.kind === 'converted').slice(0, 10)
  return (
    <Card className="mb-3">
      <Link to={`/sales/leads/${lead.id}`} className="block px-4 py-3 text-[15px] font-semibold text-brand">
        Sales lead: {lead.name}
        {lead.org ? ` · ${lead.org.name}` : ''}
      </Link>
      {shown.map((a) => (
        <div key={a.id}>
          <Divider />
          <div className="px-4 py-2.5 text-[15px]">
            <p className="flex gap-2">
              <span className="min-w-0 flex-1 font-semibold">
                {a.kind === 'call'
                  ? `Call: ${a.outcome ? outcomeLabels[a.outcome] : ''}`
                  : a.kind === 'note'
                    ? 'Note'
                    : 'Became a customer'}
              </span>
              <span className="shrink-0 text-[12px] text-muted">
                {new Date(a.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </p>
            {a.note && a.kind !== 'converted' && <p className="whitespace-pre-wrap">{a.note}</p>}
            <p className="text-[12px] text-muted">{a.by_user === user.id ? 'You' : nameOf(a.by_user ?? '')}</p>
          </div>
        </div>
      ))}
    </Card>
  )
}
