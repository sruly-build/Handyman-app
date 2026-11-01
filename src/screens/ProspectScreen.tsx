import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckIcon, MailIcon, MessageIcon, PhoneIcon, PlusIcon } from '../components/Icons'
import { LeadStatusPill } from '../components/LeadPanel'
import { CallButton, FollowUpLine, FollowUpSheet, StagePill, whenLabel } from '../components/Sales'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, EmptyState, ErrorNote, GroupLabel, Loading } from '../components/ui'
import { backend } from '../data/backend'
import {
  refreshAll,
  useActivities,
  useOpportunities,
  usePeople,
  usePeopleNames,
  useProperties,
  useProspects,
} from '../data/queries'
import { interestLabels, orgTypeLabels, outcomeLabels, stageLabels, stageOrder } from '../data/sales'
import type { ProspectStage, SalesActivity } from '../data/types'
import { useUser } from '../lib/auth'
import { friendlyDate, todayISO } from '../lib/dates'
import { textLink } from '../lib/links'

/** One lead: everything needed during or right after a call */
export function ProspectScreen() {
  const { leadId = '' } = useParams()
  const user = useUser()
  const { data: leads, isLoading, error } = useProspects()
  const lead = leads?.find((l) => l.id === leadId)
  const { data: activities = [] } = useActivities(leadId)
  const { data: properties = [] } = useProperties(leadId)
  const { data: opportunities = [] } = useOpportunities(leadId)
  const { data: people = [] } = usePeople()
  const nameOf = usePeopleNames()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [note, setNote] = useState('')
  const [scheduling, setScheduling] = useState(false)

  const done = { onSettled: () => refreshAll(qc) }
  const addNote = useMutation({
    mutationFn: () => backend.addSalesNote(leadId, note),
    onSuccess: () => setNote(''),
    ...done,
  })
  const setStage = useMutation({ mutationFn: (s: ProspectStage) => backend.setProspectStage(lead!, s), ...done })
  const assign = useMutation({
    mutationFn: (to: string | null) =>
      backend.saveProspect(
        {
          ...lead!,
          assigned_to: to,
          org_name: lead!.org?.name ?? '',
          org_type: lead!.org?.org_type ?? 'other',
          service_area: lead!.org?.service_area ?? '',
          units_estimate: lead!.org?.units_estimate ?? null,
        },
        leadId,
      ),
    ...done,
  })
  const complete = useMutation({ mutationFn: () => backend.completeFollowUp(lead!.follow_up!.id), ...done })
  const archive = useMutation({
    mutationFn: () => backend.archiveProspect(leadId, !lead!.archived_at),
    ...done,
  })
  const convert = useMutation({ mutationFn: () => backend.convertProspect(lead!), ...done })

  const back = { to: '/sales/leads', label: 'Leads' }
  if (isLoading || error || !lead) {
    return (
      <Screen title="Lead" back={back}>
        {error ? <ErrorNote error={error} /> : leads ? <p className="px-4">This lead was deleted.</p> : <Loading />}
      </Screen>
    )
  }

  const first = lead.name.split(/\s+/)[0]
  const anyError = addNote.error || setStage.error || assign.error || complete.error || archive.error || convert.error
  const action =
    'flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl bg-card text-[14px] font-semibold text-brand active:bg-brand-soft'

  return (
    <Screen
      title={lead.name}
      eyebrow={lead.org ? `${lead.org.name} · ${orgTypeLabels[lead.org.org_type]}` : undefined}
      back={back}
      wide
      action={
        <Link
          to={`/sales/leads/${lead.id}/edit`}
          className="min-h-11 px-1 py-2 text-[17px] text-brand active:opacity-50"
        >
          Edit
        </Link>
      }
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6">
        <div>
          <div className="-mt-2 mb-3 flex flex-wrap items-center gap-2">
            <StagePill stage={lead.stage} />
            {lead.archived_at && (
              <span className="rounded-full bg-hairline px-2 py-0.5 text-[12px] font-semibold">Archived</span>
            )}
            {lead.interest !== 'unknown' && (
              <span className="text-[13px] text-muted">{interestLabels[lead.interest]} interest</span>
            )}
          </div>

          <CallButton
            lead={lead}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-[19px] font-bold text-white active:bg-brand-dark"
          >
            <PhoneIcon size={24} />
            Call {first}
          </CallButton>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {lead.phone ? (
              <a href={textLink(lead.phone)} className={action}>
                <MessageIcon size={22} />
                Text
              </a>
            ) : (
              <span className={`${action} text-[#c7c7cc]`}>
                <MessageIcon size={22} />
                Text
              </span>
            )}
            {lead.email ? (
              <a href={`mailto:${lead.email}`} className={action}>
                <MailIcon size={22} />
                Email
              </a>
            ) : (
              <span className={`${action} text-[#c7c7cc]`}>
                <MailIcon size={22} />
                Email
              </span>
            )}
          </div>
          <p className="mt-2 px-1 text-[13px] text-muted">
            {lead.last_contacted_at
              ? `Last contacted ${friendlyDate(todayISO(new Date(lead.last_contacted_at)))}${lead.last_contacted_by ? ` by ${lead.last_contacted_by === user.id ? 'you' : nameOf(lead.last_contacted_by)}` : ''}`
              : 'Not contacted yet'}
          </p>

          {/* Next follow-up */}
          <Card className="mt-4">
            {lead.follow_up ? (
              <div className="px-4 py-3">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">Next follow-up</p>
                <FollowUpLine lead={lead} />
                {lead.follow_up.note && <p className="text-[15px]">{lead.follow_up.note}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => complete.mutate()}
                    className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-brand-soft text-[15px] font-semibold text-brand-dark"
                  >
                    <CheckIcon size={16} strokeWidth={3} /> Done
                  </button>
                  <button
                    onClick={() => setScheduling(true)}
                    className="min-h-11 flex-1 rounded-xl bg-canvas text-[15px] font-semibold text-brand"
                  >
                    Reschedule
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setScheduling(true)}
                className="flex min-h-14 w-full items-center justify-center gap-2 text-[17px] font-semibold text-brand active:bg-canvas"
              >
                <PlusIcon size={20} /> Schedule a follow-up
              </button>
            )}
          </Card>
          {scheduling && <FollowUpSheet lead={lead} onClose={() => setScheduling(false)} />}

          {/* Stage and who's on it */}
          <Card className="mt-4">
            <label className="block px-4 py-2.5">
              <span className="block text-[13px] font-medium text-muted">Stage</span>
              <select
                value={lead.stage}
                onChange={(e) => setStage.mutate(e.target.value as ProspectStage)}
                className="min-h-10 w-full bg-transparent text-[17px] outline-none"
                aria-label="Stage"
              >
                {stageOrder
                  .filter((s) => s !== 'converted' || lead.stage === 'converted')
                  .map((s) => (
                    <option key={s} value={s}>
                      {stageLabels[s]}
                    </option>
                  ))}
              </select>
            </label>
            <Divider />
            <label className="block px-4 py-2.5">
              <span className="block text-[13px] font-medium text-muted">Who's calling them</span>
              <select
                value={lead.assigned_to ?? ''}
                onChange={(e) => assign.mutate(e.target.value || null)}
                className="min-h-10 w-full bg-transparent text-[17px] outline-none"
                aria-label="Who's calling them"
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || 'Unnamed'}
                    {p.id === user.id ? ' (me)' : ''}
                  </option>
                ))}
                <option value="">Nobody yet</option>
              </select>
            </label>
          </Card>

          {/* Contact details */}
          <Card className="mt-4">
            <Info label="Phone" value={lead.phone} />
            <Info label="Email" value={lead.email} />
            <Info label="Area" value={lead.org?.service_area ?? ''} />
            <Info label="Units" value={lead.org?.units_estimate ? `About ${lead.org.units_estimate}` : ''} />
            <Info
              label="How we know them"
              value={[
                ...lead.known_by.map((id) => `Known by ${id === user.id ? 'me' : nameOf(id)}`),
                lead.mutual ? 'Mutual connection' : '',
                lead.cold ? 'Cold lead' : '',
                lead.how_known,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
            <Info label="Notes" value={lead.notes} />
            <Info label="Possible projects" value={lead.project_notes} />
          </Card>
        </div>

        <div>
          {/* Quick note, then the full history */}
          <GroupLabel>History</GroupLabel>
          <Card className="mb-3 p-3">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Add a note…"
              aria-label="Add a note"
              className="w-full resize-none rounded-xl bg-canvas px-3 py-2 text-[16px] outline-none placeholder:text-[#8e8e93]"
            />
            <Button
              variant="secondary"
              className="mt-2 min-h-11"
              disabled={!note.trim() || addNote.isPending}
              onClick={() => addNote.mutate()}
            >
              Save note
            </Button>
          </Card>
          {activities.length > 0 && (
            <Card>
              {activities.map((a, i) => (
                <div key={a.id}>
                  {i > 0 && <Divider />}
                  <ActivityRow activity={a} by={a.by_user === user.id ? 'You' : nameOf(a.by_user ?? '')} />
                </div>
              ))}
            </Card>
          )}

          {/* Properties and units */}
          <GroupLabel>Properties</GroupLabel>
          {properties.length === 0 ? (
            <p className="mb-3 px-4 text-[14px] text-muted">None yet. Adding a turnover adds its property.</p>
          ) : (
            <Card className="mb-3">
              {properties.map(({ property, units }, i) => (
                <div key={property.id} className={`px-4 py-3 ${i > 0 ? 'border-t border-hairline' : ''}`}>
                  <p className="text-[16px] font-semibold">{property.address}</p>
                  {units.length > 0 && (
                    <p className="text-[14px] text-muted">Units: {units.map((u) => u.label).join(', ')}</p>
                  )}
                </div>
              ))}
            </Card>
          )}

          {/* Upcoming turnovers (lead jobs) */}
          <GroupLabel>Turnovers</GroupLabel>
          {opportunities.length > 0 && (
            <Card className="mb-3">
              {opportunities.map((o, i) => (
                <Link
                  key={o.id}
                  to={`/jobs/${o.id}`}
                  className={`block px-4 py-3 active:bg-canvas ${i > 0 ? 'border-t border-hairline' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[16px] font-semibold">{o.address || o.customer_name}</p>
                    {o.stage === 'lead' ? (
                      <LeadStatusPill status={o.lead_status ?? 'new'} />
                    ) : (
                      <span className="rounded-full bg-brand px-2 py-0.5 text-[12px] font-semibold text-white">
                        Job
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-muted">
                    {o.move_out_date ? `Move-out ${friendlyDate(o.move_out_date)}` : 'No move-out date'}
                    {o.ready_by_date ? ` · ready by ${friendlyDate(o.ready_by_date)}` : ''}
                    {o.walkthrough_at ? ` · walkthrough ${whenLabel(o.walkthrough_at)}` : ''}
                  </p>
                </Link>
              ))}
            </Card>
          )}
          <Link
            to={`/sales/leads/${lead.id}/turnover`}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-brand-soft text-[16px] font-semibold text-brand-dark active:opacity-70"
          >
            <PlusIcon size={20} /> Add upcoming turnover
          </Link>

          {anyError && <ErrorNote error={anyError} />}
          <div className="mt-8 space-y-3">
            {lead.client_id ? (
              <Button variant="secondary" onClick={() => navigate(`/directory/${lead.client_id}`)}>
                Open customer
              </Button>
            ) : (
              <Button
                disabled={convert.isPending}
                onClick={() =>
                  confirm(`Make ${lead.name} a customer? Their history, properties and turnovers stay with them.`) &&
                  convert.mutate()
                }
              >
                <CheckIcon size={20} strokeWidth={2.6} />
                {convert.isPending ? 'Converting…' : 'Convert to customer'}
              </Button>
            )}
            <button
              onClick={() => archive.mutate()}
              disabled={archive.isPending}
              className="min-h-11 w-full text-[15px] font-semibold text-muted active:opacity-50"
            >
              {lead.archived_at ? 'Unarchive lead' : 'Archive lead'}
            </button>
          </div>
          {activities.length === 0 && !lead.notes && (
            <div className="mt-4 hidden lg:block">
              <EmptyState title="No history yet">Calls, notes and stage changes show up here.</EmptyState>
            </div>
          )}
        </div>
      </div>
    </Screen>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="border-b border-hairline px-4 py-2.5 last:border-0">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="whitespace-pre-wrap text-[16px]">{value}</p>
    </div>
  )
}

function ActivityRow({ activity: a, by }: { activity: SalesActivity; by: string }) {
  const title =
    a.kind === 'call'
      ? `Call: ${a.outcome ? outcomeLabels[a.outcome] : ''}`
      : a.kind === 'note'
        ? 'Note'
        : a.kind === 'stage'
          ? `Stage: ${a.note}`
          : a.kind === 'created'
            ? 'Lead added'
            : a.kind === 'converted'
              ? 'Became a customer'
              : 'Follow-up'
  const body = a.kind === 'stage' || a.kind === 'created' || a.kind === 'converted' ? '' : a.note
  const when = new Date(a.created_at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return (
    <div className="px-4 py-2.5">
      <p className="flex items-baseline gap-2 text-[15px]">
        <span className="min-w-0 flex-1 font-semibold">{title}</span>
        <span className="shrink-0 text-[12px] text-muted">{when}</span>
      </p>
      {body && <p className="whitespace-pre-wrap text-[15px]">{body}</p>}
      <p className="text-[12px] text-muted">{by}</p>
    </div>
  )
}
