import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { HouseIcon, PlusIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { Card, EmptyState, ErrorNote, Loading, Segmented } from '../components/ui'
import { useRequests, useServiceSettings } from '../data/queries'
import { flagLabels, inboxOrder, issueSummary, repeatIssues, requestFlags, type RequestFlag } from '../data/requests'
import type { ServiceRequest, Urgency } from '../data/types'

export const urgencyStyle: Record<Urgency, string> = {
  emergency: 'bg-problem text-white',
  soon: 'bg-progress-soft text-[#8a4b00]',
  whenever: 'bg-canvas text-muted',
}
export const urgencyLabel: Record<Urgency, string> = { emergency: 'Emergency', soon: 'Soon', whenever: 'Whenever' }
export const sourceLabel = { web: 'Request page', text: 'Text', owner: 'Typed in', landlord: 'Landlord' }

export function FlagPill({ flag }: { flag: RequestFlag }) {
  const style = flag === 'emergency' ? 'bg-problem-soft text-problem' : flag === 'repeat' ? 'bg-[#efe7fb] text-[#5b2bb5]' : 'bg-progress-soft text-[#8a4b00]'
  return <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${style}`}>{flagLabels[flag]}</span>
}

type View = 'open' | 'scheduled' | 'done'

/** All repair requests: from the request page, texts, or typed in */
export function RequestsScreen() {
  const { data, isLoading, error } = useRequests()
  const { data: settings } = useServiceSettings()
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as View) || 'open'
  const repeats = useMemo(() => repeatIssues(data ?? [], settings?.repeat_threshold ?? 3), [data, settings])

  const lists: Record<View, ServiceRequest[]> = {
    open: (data ?? []).filter((r) => r.status === 'new').sort(inboxOrder),
    scheduled: (data ?? [])
      .filter((r) => r.status === 'scheduled')
      .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '')),
    done: (data ?? []).filter((r) => r.status === 'done' || r.status === 'closed'),
  }
  const list = lists[view]

  return (
    <Screen
      title="Requests"
      action={
        <div className="flex items-center gap-1">
          <Link to="/houses" className="flex min-h-11 items-center gap-1 px-2 text-[17px] text-brand" aria-label="Houses">
            <HouseIcon size={22} /> Houses
          </Link>
          <Link to="/requests/new" className="flex h-11 w-11 items-center justify-center text-brand" aria-label="Add a request">
            <PlusIcon size={26} />
          </Link>
        </div>
      }
    >
      <Segmented
        label="Show"
        value={view}
        onChange={(v) => setParams({ view: v }, { replace: true })}
        options={[
          { value: 'open', label: `New${lists.open.length ? ` (${lists.open.length})` : ''}` },
          { value: 'scheduled', label: `Scheduled${lists.scheduled.length ? ` (${lists.scheduled.length})` : ''}` },
          { value: 'done', label: 'Done' },
        ]}
      />
      <div className="mt-4">
        {isLoading && <Loading />}
        {error && <ErrorNote error={error} />}
        {data && list.length === 0 && (
          <EmptyState title={view === 'open' ? 'No new requests' : view === 'scheduled' ? 'Nothing scheduled' : 'Nothing done yet'}>
            {view === 'open' && 'Requests from your request page and texts show up here. Share your link from Me → Request page.'}
          </EmptyState>
        )}
        {list.length > 0 && (
          <Card>
            {list.map((r, i) => (
              <RequestRow key={r.id} r={r} flags={requestFlags(r, repeats)} first={i === 0} />
            ))}
          </Card>
        )}
      </div>
    </Screen>
  )
}

export function RequestRow({ r, flags, first }: { r: ServiceRequest; flags: RequestFlag[]; first: boolean }) {
  return (
    <Link to={`/requests/${r.id}`} className={`block px-4 py-3 active:bg-canvas ${first ? '' : 'border-t border-hairline'}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold">
            {r.address ? r.address.split(',')[0] : 'No address yet'}
            {r.unit_label ? ` · ${r.unit_label}` : ''}
          </p>
          <p className="truncate text-[15px]">{issueSummary(r)}</p>
          <p className="truncate text-[13px] text-muted">
            {r.is_member ? 'On the plan' : 'Not on the plan'} · {sourceLabel[r.source]} ·{' '}
            {r.scheduled_at && r.status === 'scheduled'
              ? new Date(r.scheduled_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
              : new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold ${urgencyStyle[r.urgency]}`}>{urgencyLabel[r.urgency]}</span>
      </div>
      {flags.filter((f) => f !== 'emergency').length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {flags.filter((f) => f !== 'emergency').map((f) => (
            <FlagPill key={f} flag={f} />
          ))}
        </div>
      )}
    </Link>
  )
}
