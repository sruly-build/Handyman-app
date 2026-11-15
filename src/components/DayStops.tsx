import { Link } from 'react-router-dom'
import { scheduleEvents, type ScheduleEvent } from '../data/schedule'
import { useAllItems, useProspects, useRequests, useSchedule } from '../data/queries'
import { issueSummary } from '../data/requests'
import { clockLabel, localParts } from '../lib/dates'
import { directionsLink } from '../lib/links'
import { ChevronIcon, DirectionsIcon } from './Icons'
import { Card } from './ui'

export interface Stop {
  key: string
  kind: ScheduleEvent['kind'] | 'request'
  time: string | null
  name: string
  what: string
  address: string
  link: string
}

const kindWord = { walkthrough: 'Walkthrough', job: 'Job', meeting: 'Sales meeting', items: 'Punch items' }

/**
 * Every place to go on a day: jobs, walkthroughs, punch list items planned
 * for that day, sales meetings, and scheduled repair requests not yet made
 * into a job. In time order (no time = all day, first).
 */
export function useDayStops(date: string): { stops: Stop[]; loading: boolean } {
  const { data: jobs, isLoading } = useSchedule()
  const { data: leads = [] } = useProspects()
  const { data: items = [] } = useAllItems()
  const { data: requests = [] } = useRequests()
  const meetings = leads.filter((l) => l.follow_up?.kind === 'meeting' && !l.archived_at).map((l) => ({ meeting: l.follow_up!, lead: l }))
  const events: ScheduleEvent[] = scheduleEvents((jobs ?? []).filter((j) => j.from_company === null), meetings, items).filter((e) => e.date === date)
  const stops: Stop[] = events.map((e) => ({
    key: e.key,
    kind: e.kind,
    time: e.time,
    name: e.job.customer_name,
    what: e.items ? `${e.items.length} punch item${e.items.length === 1 ? '' : 's'}: ${e.items.map((i) => i.title).join(', ')}` : kindWord[e.kind],
    address: e.job.address,
    link: e.link,
  }))
  for (const r of requests) {
    if (r.status !== 'scheduled' || !r.scheduled_at || r.job_id) continue
    const { date: d, time } = localParts(r.scheduled_at)
    if (d !== date) continue
    stops.push({
      key: `r-${r.id}`,
      kind: 'request',
      time,
      name: r.requester_name || 'Repair request',
      what: `Request: ${issueSummary(r)}`,
      address: r.unit_label ? `${r.address}, ${r.unit_label}` : r.address,
      link: `/requests/${r.id}`,
    })
  }
  stops.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  return { stops, loading: isLoading }
}

/** A day's stops: time, who, what, address, and a Directions button */
export function StopList({ stops }: { stops: Stop[] }) {
  return (
    <Card>
      {stops.map((s, i) => (
        <div key={s.key} className={`flex items-center ${i > 0 ? 'border-t border-hairline' : ''}`}>
          <Link to={s.link} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 active:bg-canvas">
            <span className="w-16 shrink-0 text-[14px] font-semibold">{s.time ? clockLabel(s.time) : 'All day'}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[17px] font-semibold">{s.address || s.name}</span>
              <span className="block truncate text-[14px] text-muted">
                {s.address ? `${s.name} · ${s.what}` : s.what}
              </span>
            </span>
            <ChevronIcon size={18} className="shrink-0 text-[#c7c7cc]" />
          </Link>
          {s.address ? (
            <a
              href={directionsLink(s.address)}
              target="_blank"
              rel="noreferrer"
              className="flex h-16 w-14 shrink-0 items-center justify-center text-brand active:opacity-50"
              aria-label={`Directions to ${s.address}`}
            >
              <DirectionsIcon size={22} />
            </a>
          ) : (
            <span className="w-14 shrink-0" />
          )}
        </div>
      ))}
    </Card>
  )
}
