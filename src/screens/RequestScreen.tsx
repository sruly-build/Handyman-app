import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DirectionsIcon, HouseIcon, MessageIcon, PhoneIcon } from '../components/Icons'
import { ReadyTextSheet } from '../components/ReadyText'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, GroupLabel, Loading, Segmented, Toggle } from '../components/ui'
import { backend } from '../data/backend'
import { refreshAll, useCompany, useRequestPhotos, useRequests, useServiceSettings } from '../data/queries'
import {
  issueSummary,
  nearbyWhenever,
  readyReply,
  repeatIssues,
  requestFlags,
  suggestedTimeframe,
} from '../data/requests'
import type { ServiceRequest, Urgency } from '../data/types'
import { localParts } from '../lib/dates'
import { directionsLink, phoneLink } from '../lib/links'
import { FlagPill, RequestRow, sourceLabel, urgencyLabel } from './RequestsScreen'

export function RequestScreen() {
  const { requestId = '' } = useParams()
  const { data: all, isLoading, error } = useRequests()
  const r = all?.find((x) => x.id === requestId)
  if (isLoading || error || !r) {
    return (
      <Screen title="Request" back={{ to: '/requests', label: 'Requests' }}>
        {error ? <ErrorNote error={error} /> : all && !r ? <p className="px-1">This request was deleted.</p> : <Loading />}
      </Screen>
    )
  }
  return <RequestDetail r={r} all={all!} />
}

function RequestDetail({ r, all }: { r: ServiceRequest; all: ServiceRequest[] }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data: settings } = useServiceSettings()
  const { data: company } = useCompany()
  const { data: photos = [] } = useRequestPhotos(r.id)
  const [texting, setTexting] = useState(false)
  const initial = r.scheduled_at ? localParts(r.scheduled_at) : { date: '', time: '' }
  const [date, setDate] = useState(initial.date)
  const [time, setTime] = useState(initial.time || '09:00')

  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => void refreshAll(qc),
  })
  const convert = useMutation({
    mutationFn: () => backend.convertRequest(r),
    onSuccess: (job) => {
      void refreshAll(qc)
      navigate(`/jobs/${job.id}`)
    },
  })

  const repeats = repeatIssues(all, settings?.repeat_threshold ?? 3)
  const flags = requestFlags(r, repeats)
  const nearby = nearbyWhenever(r, all, settings?.nearby_miles ?? 3)
  const houseHistory = all.filter((x) => x.property_id && x.property_id === r.property_id && x.id !== r.id)
  const business = company?.name ?? ''
  const open = r.status === 'new' || r.status === 'scheduled'

  const choices = [
    { label: 'Got it', text: readyReply('received', r, business) },
    ...(r.scheduled_at ? [{ label: 'Scheduled', text: readyReply('scheduled', r, business) }] : []),
    ...(flags.includes('photo_needed') ? [{ label: 'Photo needed', text: readyReply('photo', r, business) }] : []),
    ...(flags.includes('address_needed') ? [{ label: 'Address needed', text: readyReply('address', r, business) }] : []),
  ]
  // Most useful first
  if (r.status === 'scheduled') choices.sort((a) => (a.label === 'Scheduled' ? -1 : 0))
  else if (flags.includes('address_needed')) choices.sort((a) => (a.label === 'Address needed' ? -1 : 0))
  else if (flags.includes('photo_needed')) choices.sort((a) => (a.label === 'Photo needed' ? -1 : 0))

  const action =
    'flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl bg-card text-[15px] font-semibold text-brand active:bg-brand-soft'
  const off = 'flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl bg-card text-[15px] font-semibold text-[#c7c7cc]'

  return (
    <Screen title={r.address ? r.address.split(',')[0] : 'No address yet'} eyebrow={r.unit_label || undefined} back={{ to: '/requests', label: 'Requests' }}>
      <div className="-mt-3 mb-4 flex flex-wrap gap-1.5 px-1">
        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[12px] font-semibold text-brand-dark">
          {r.is_member ? 'On the plan' : 'Not on the plan'}
        </span>
        <span className="rounded-full bg-hairline px-2 py-0.5 text-[12px] font-semibold text-[#636366]">{sourceLabel[r.source]}</span>
        {flags.map((f) => (
          <FlagPill key={f} flag={f} />
        ))}
        {r.status !== 'new' && (
          <span className="rounded-full bg-ink px-2 py-0.5 text-[12px] font-semibold text-white">
            {r.status === 'scheduled' ? 'Scheduled' : r.status === 'done' ? 'Done' : 'Closed'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {r.requester_phone ? (
          <a href={phoneLink(r.requester_phone)} className={action}>
            <PhoneIcon size={24} /> Call
          </a>
        ) : (
          <span className={off}>
            <PhoneIcon size={24} /> Call
          </span>
        )}
        {r.requester_phone ? (
          <button onClick={() => setTexting(true)} className={action}>
            <MessageIcon size={24} /> Text
          </button>
        ) : (
          <span className={off}>
            <MessageIcon size={24} /> Text
          </span>
        )}
        {r.address ? (
          <a href={directionsLink(r.address)} target="_blank" rel="noreferrer" className={action}>
            <DirectionsIcon size={24} /> Directions
          </a>
        ) : (
          <span className={off}>
            <DirectionsIcon size={24} /> Directions
          </span>
        )}
      </div>

      <Section title="From">
        <Card>
          <Row label="Name" value={r.requester_name || '—'} />
          <Divider />
          <Row label="Phone" value={r.requester_phone || '—'} />
          <Divider />
          <Row
            label="Who"
            value={`${r.requester_kind === 'tenant' ? 'Tenant' : r.requester_kind === 'landlord' ? 'Landlord' : 'Other'}${
              r.is_member ? (r.verified ? ' · known number' : ' · unknown number') : ''
            }`}
          />
          <Divider />
          <Row label="Sent" value={new Date(r.created_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} />
          {r.property_id && (
            <>
              <Divider />
              <Link to={`/houses/${r.property_id}`} className="flex min-h-12 items-center gap-2 px-4 text-[17px] text-brand">
                <HouseIcon size={20} /> House, tenants and history
              </Link>
            </>
          )}
        </Card>
      </Section>

      <Section title="What needs fixing">
        <Card>
          {r.issues.map((issue, i) => {
            const mine = photos.filter((p) => p.issue_index === i)
            return (
              <div key={i} className={`px-4 py-3 ${i > 0 ? 'border-t border-hairline' : ''}`}>
                <p className="text-[17px] font-semibold">{issue.key === 'other' ? 'Custom issue' : issue.label}</p>
                {issue.text && <p className="text-[15px]">{issue.text}</p>}
                {issue.tried.length > 0 && <p className="mt-1 text-[13px] text-muted">Already tried: {issue.tried.join('; ')}</p>}
                {mine.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {mine.map((p) => (
                      <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="relative block h-24 w-24 overflow-hidden rounded-xl bg-canvas">
                        <img src={p.url} alt="" className="h-full w-full object-cover" />
                        {p.kind === 'sticker' && <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 text-[11px] text-white">Model sticker</span>}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {r.issues.length === 0 && <p className="px-4 py-3 text-[15px]">{issueSummary(r)}</p>}
          {r.description && (
            <div className="border-t border-hairline px-4 py-3">
              <p className="text-[13px] font-medium text-muted">Details</p>
              <p className="whitespace-pre-wrap text-[15px]">{r.description}</p>
              {r.original_text && r.original_text !== r.description && (
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-muted" dir="auto">Original: {r.original_text}</p>
              )}
            </div>
          )}
          {(r.punch_list || photos.some((p) => p.kind === 'list')) && (
            <div className="border-t border-hairline px-4 py-3">
              <p className="text-[13px] font-medium text-muted">Their list</p>
              {r.punch_list && <p className="whitespace-pre-wrap text-[15px]">{r.punch_list}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {photos.filter((p) => p.kind === 'list').map((p) => (
                  <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block h-24 w-24 overflow-hidden rounded-xl bg-canvas">
                    <img src={p.url} alt="List" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </Card>
      </Section>

      <Section title="Urgency">
        <Segmented<Urgency>
          label="Urgency"
          value={r.urgency}
          onChange={(urgency) => run.mutate(() => backend.updateRequest(r.id, { urgency }))}
          options={(['emergency', 'soon', 'whenever'] as Urgency[]).map((u) => ({ value: u, label: urgencyLabel[u] }))}
        />
        <p className="mt-1.5 px-4 text-[13px] text-muted">
          Suggested: {suggestedTimeframe(r.urgency)}
          {r.urgency !== r.tenant_urgency ? ` · they picked ${urgencyLabel[r.tenant_urgency]}` : ''}
        </p>
      </Section>

      <Section title="When">
        <Card>
          {(r.best_days.length > 0 || r.best_hours) && (
            <>
              <Row label="Best for them" value={[r.best_days.join(', '), r.best_hours].filter(Boolean).join(' · ')} />
              <Divider />
            </>
          )}
          <div className="grid grid-cols-2">
            <label className="block px-4 py-2.5">
              <span className="block text-[13px] font-medium text-muted">Day</span>
              <input type="date" aria-label="Visit day" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-10 w-full bg-transparent outline-none" />
            </label>
            <label className="block border-l border-hairline px-4 py-2.5">
              <span className="block text-[13px] font-medium text-muted">Time</span>
              <input type="time" aria-label="Visit time" value={time} onChange={(e) => setTime(e.target.value)} className="min-h-10 w-full bg-transparent outline-none" />
            </label>
          </div>
        </Card>
        <div className="mt-3 flex gap-3">
          <Button
            variant="secondary"
            disabled={!date || run.isPending}
            onClick={() => run.mutate(() => backend.scheduleRequest(r, new Date(`${date}T${time || '09:00'}`).toISOString()))}
          >
            {r.scheduled_at ? 'Change time' : 'Schedule'}
          </Button>
          {r.scheduled_at && (
            <Button
              variant="secondary"
              className="!w-auto"
              onClick={() => {
                setDate('')
                run.mutate(() => backend.scheduleRequest(r, null))
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </Section>

      <Section title="Job">
        {r.job_id ? (
          <Link to={`/jobs/${r.job_id}`} className="flex min-h-14 items-center justify-center rounded-2xl bg-brand text-[17px] font-semibold text-white">
            Open the job
          </Link>
        ) : (
          <>
            <Button onClick={() => convert.mutate()} disabled={convert.isPending}>
              {convert.isPending ? 'Making it…' : r.is_member ? 'Convert to job' : 'Make it a lead'}
            </Button>
            <p className="mt-1.5 px-4 text-[13px] text-muted">
              {r.is_member
                ? 'The address, photos and each issue (as a punch list item) go onto a new job.'
                : 'Not on the plan, so it goes through your lead-to-job flow (walkthrough, estimate, then job).'}
            </p>
          </>
        )}
        {convert.error && <div className="mt-2"><ErrorNote error={convert.error} /></div>}
        <Card className="mt-3">
          <Toggle
            label="Over an hour"
            hint="Just a flag: nothing is billed automatically"
            checked={r.over_hour}
            onChange={(over_hour) => run.mutate(() => backend.updateRequest(r.id, { over_hour }))}
          />
          {r.is_member && (
            <>
              <Divider />
              <Toggle
                label="Needs landlord approval"
                checked={r.needs_approval}
                onChange={(needs_approval) => run.mutate(() => backend.updateRequest(r.id, { needs_approval }))}
              />
            </>
          )}
        </Card>
      </Section>

      {nearby.length > 0 && (
        <Section title={`Whenever requests nearby (${nearby.length})`}>
          <Card>
            {nearby.map((x, i) => (
              <RequestRow key={x.id} r={x} flags={requestFlags(x, repeats)} first={i === 0} />
            ))}
          </Card>
          <p className="mt-1.5 px-4 text-[13px] text-muted">In driving order from here, within {settings?.nearby_miles ?? 3} miles.</p>
        </Section>
      )}

      {houseHistory.length > 0 && (
        <Section title="Earlier at this house">
          <Card>
            {houseHistory.slice(0, 8).map((x, i) => (
              <RequestRow key={x.id} r={x} flags={requestFlags(x, repeats)} first={i === 0} />
            ))}
          </Card>
        </Section>
      )}

      <div className="mt-8 space-y-3">
        {run.error && <ErrorNote error={run.error} />}
        {open ? (
          <>
            <Button variant="secondary" onClick={() => run.mutate(() => backend.setRequestDone(r, true))}>
              Mark done
            </Button>
            <Button variant="secondary" onClick={() => run.mutate(() => backend.closeRequest(r, true))}>
              Close without a visit
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => run.mutate(() => (r.status === 'done' ? backend.setRequestDone(r, false) : backend.closeRequest(r, false)))}>
            Reopen
          </Button>
        )}
        <Button
          variant="danger"
          onClick={() => {
            if (window.confirm('Delete this request and its photos? This cannot be undone.')) {
              void backend.deleteRequest(r).then(() => {
                void refreshAll(qc)
                navigate('/requests', { replace: true })
              })
            }
          }}
        >
          Delete request
        </Button>
      </div>

      {texting && (
        <ReadyTextSheet
          phone={r.requester_phone}
          title={`Message ${r.requester_name.split(/\s+/)[0] || 'them'}`}
          choices={choices}
          onClose={() => setTexting(false)}
        />
      )}
    </Screen>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <GroupLabel>{title}</GroupLabel>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-12 items-center gap-3 px-4 py-2">
      <span className="w-28 shrink-0 text-[15px] text-muted">{label}</span>
      <span className="min-w-0 flex-1 text-[17px]">{value}</span>
    </div>
  )
}
