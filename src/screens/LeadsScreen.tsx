import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarIcon, PlusIcon } from '../components/Icons'
import { LeadStatusPill, walkthroughLabel } from '../components/LeadPanel'
import { Screen } from '../components/Screen'
import { Card, EmptyState, ErrorNote, GroupLabel, Loading, Segmented } from '../components/ui'
import { useLeads } from '../data/queries'
import type { JobSummary, LeadStatus } from '../data/types'

const openGroups: { status: LeadStatus; title: string }[] = [
  { status: 'new', title: 'New' },
  { status: 'walkthrough_booked', title: 'Walkthrough booked' },
  { status: 'estimate_sent', title: 'Estimate sent' },
]

/** People who asked for work, before it's a job */
export function LeadsScreen() {
  const { data: leads, isLoading, error } = useLeads()
  const [show, setShow] = useState<'open' | 'archived'>('open')
  // Only our own leads (never another company's)
  const ours = (leads ?? []).filter((l) => l.from_company === null)
  const archived = ours
    .filter((l) => l.lead_status === 'lost')
    .sort((a, b) => (b.lead_closed_at ?? b.created_at).localeCompare(a.lead_closed_at ?? a.created_at))
  const open = ours.filter((l) => l.lead_status !== 'lost')

  return (
    <Screen
      title="Leads"
      action={
        <Link
          to="/leads/new"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white active:bg-brand-dark"
          aria-label="New lead"
        >
          <PlusIcon size={24} strokeWidth={2.6} />
        </Link>
      }
    >
      <Segmented
        label="Show"
        value={show}
        onChange={setShow}
        options={[
          { value: 'open', label: `Open${open.length ? ` (${open.length})` : ''}` },
          { value: 'archived', label: `Archived${archived.length ? ` (${archived.length})` : ''}` },
        ]}
      />
      <div className="mt-4">
        {isLoading && <Loading />}
        {error && <ErrorNote error={error} />}

        {leads && show === 'open' && open.length === 0 && (
          <EmptyState title="No open leads">
            When someone calls about work, tap + to save their name, phone, address and what they need.
          </EmptyState>
        )}
        {show === 'open' &&
          openGroups.map(({ status, title }) => {
            const group = open
              .filter((l) => (l.lead_status ?? 'new') === status)
              .sort((a, b) =>
                status === 'walkthrough_booked'
                  ? (a.walkthrough_at ?? '').localeCompare(b.walkthrough_at ?? '')
                  : b.created_at.localeCompare(a.created_at),
              )
            if (group.length === 0) return null
            return (
              <section key={status} className="mb-5">
                <GroupLabel>{title}</GroupLabel>
                <div className="space-y-3">
                  {group.map((l) => (
                    <LeadCard key={l.id} lead={l} />
                  ))}
                </div>
              </section>
            )
          })}

        {leads && show === 'archived' && archived.length === 0 && (
          <EmptyState title="Nothing archived">
            Leads you mark as lost are kept here, so you can find them later.
          </EmptyState>
        )}
        {show === 'archived' && (
          <div className="space-y-3">
            {archived.map((l) => (
              <LeadCard key={l.id} lead={l} />
            ))}
          </div>
        )}
      </div>
    </Screen>
  )
}

function LeadCard({ lead }: { lead: JobSummary }) {
  return (
    <Link to={`/jobs/${lead.id}`} className="block transition active:scale-[0.98]">
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[19px] font-semibold">{lead.customer_name}</p>
          <LeadStatusPill status={lead.lead_status ?? 'new'} />
        </div>
        {lead.address && <p className="truncate text-[15px] text-muted">{lead.address}</p>}
        {lead.notes && <p className="mt-0.5 line-clamp-2 text-[15px]">{lead.notes}</p>}
        {lead.walkthrough_at && lead.lead_status !== 'lost' && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[14px] font-semibold text-[#8a4b00]">
            <CalendarIcon size={16} />
            Walkthrough {walkthroughLabel(lead.walkthrough_at)}
          </p>
        )}
      </Card>
    </Link>
  )
}
