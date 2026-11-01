import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PlusIcon, SearchIcon } from '../components/Icons'
import { CallButton, FollowUpLine, LeadCard, SalesNav, StagePill } from '../components/Sales'
import { Screen } from '../components/Screen'
import { EmptyState, ErrorNote, Loading } from '../components/ui'
import { usePeople, usePeopleNames, useProspects } from '../data/queries'
import { interestLabels, orgTypeLabels, stageLabels, stageOrder } from '../data/sales'
import type { Interest, OrgType, ProspectStage, ProspectView } from '../data/types'
import { friendlyDate, todayISO } from '../lib/dates'

type Sort = 'follow_up' | 'last_contacted' | 'name' | 'newest'

const matches = (l: ProspectView, q: string) => {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const hay = [l.name, l.org?.name, l.email, l.org?.service_area, l.notes, l.project_notes, l.how_known]
    .join(' ')
    .toLowerCase()
  const digits = l.phone.replace(/\D/g, '')
  return words.every((w) => hay.includes(w) || (/^\d+$/.test(w) && digits.includes(w)))
}

/** Every lead: search, filter by stage, partner, interest and type, sort, and archived ones */
export function ProspectsScreen() {
  const { data: leads, isLoading, error } = useProspects()
  const { data: people = [] } = usePeople()
  const nameOf = usePeopleNames()
  // Filters live in the address, so Back from a lead keeps them
  const [params, setParams] = useSearchParams()
  const get = (k: string) => params.get(k) ?? ''
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }
  const [query, setQuery] = useState('')
  const stage = get('stage') as ProspectStage | ''
  const partner = get('partner')
  const interest = get('interest') as Interest | ''
  const type = get('type') as OrgType | ''
  const sort = (get('sort') || 'follow_up') as Sort
  const archived = get('archived') === '1'

  const shown = (leads ?? [])
    .filter((l) => (archived ? Boolean(l.archived_at) : !l.archived_at))
    .filter((l) => !stage || l.stage === stage)
    .filter((l) => !partner || (partner === 'none' ? !l.assigned_to : l.assigned_to === partner))
    .filter((l) => !interest || l.interest === interest)
    .filter((l) => !type || l.org?.org_type === type)
    .filter((l) => !query.trim() || matches(l, query))
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'newest') return b.created_at.localeCompare(a.created_at)
      if (sort === 'last_contacted') return (b.last_contacted_at ?? '').localeCompare(a.last_contacted_at ?? '')
      return (a.follow_up?.due_at ?? '9').localeCompare(b.follow_up?.due_at ?? '9')
    })
  const select = 'min-h-10 rounded-full bg-card px-3 text-[14px] font-semibold outline-none'

  return (
    <Screen
      title="Leads"
      wide
      action={
        <Link
          to="/sales/leads/new"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white active:bg-brand-dark"
          aria-label="New lead"
        >
          <PlusIcon size={24} strokeWidth={2.6} />
        </Link>
      }
    >
      <SalesNav />
      <label className="flex min-h-12 items-center gap-2 rounded-2xl bg-card px-4">
        <SearchIcon size={20} className="shrink-0 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, company, area, phone…"
          aria-label="Search leads"
          className="w-full bg-transparent py-2 text-[17px] outline-none placeholder:text-[#8e8e93]"
        />
      </label>
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <select aria-label="Stage" value={stage} onChange={(e) => setParam('stage', e.target.value)} className={select}>
          <option value="">All stages</option>
          {stageOrder.map((s) => (
            <option key={s} value={s}>
              {stageLabels[s]}
            </option>
          ))}
        </select>
        <select
          aria-label="Partner"
          value={partner}
          onChange={(e) => setParam('partner', e.target.value)}
          className={select}
        >
          <option value="">Anyone's</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name || 'Unnamed'}'s
            </option>
          ))}
          <option value="none">Not assigned</option>
        </select>
        <select
          aria-label="Interest"
          value={interest}
          onChange={(e) => setParam('interest', e.target.value)}
          className={select}
        >
          <option value="">Any interest</option>
          {(Object.keys(interestLabels) as Interest[]).map((i) => (
            <option key={i} value={i}>
              {i === 'unknown' ? 'Interest unknown' : `${interestLabels[i]} interest`}
            </option>
          ))}
        </select>
        <select aria-label="Type" value={type} onChange={(e) => setParam('type', e.target.value)} className={select}>
          <option value="">Any type</option>
          {(Object.keys(orgTypeLabels) as OrgType[]).map((t) => (
            <option key={t} value={t}>
              {orgTypeLabels[t]}
            </option>
          ))}
        </select>
        <select aria-label="Sort" value={sort} onChange={(e) => setParam('sort', e.target.value)} className={select}>
          <option value="follow_up">Next follow-up</option>
          <option value="last_contacted">Last contacted</option>
          <option value="name">Name</option>
          <option value="newest">Newest</option>
        </select>
        <button
          type="button"
          aria-pressed={archived}
          onClick={() => setParam('archived', archived ? '' : '1')}
          className={`${select} ${archived ? 'bg-ink text-white' : ''}`}
        >
          Archived
        </button>
      </div>

      <div className="mt-4">
        {isLoading && <Loading />}
        {error && <ErrorNote error={error} />}
        {leads && shown.length === 0 && (
          <EmptyState title={leads.length === 0 ? 'No leads yet' : 'Nobody here'}>
            {leads.length === 0 ? 'Tap + to add someone you know.' : 'Try another search or filter.'}
          </EmptyState>
        )}

        {/* Phone: compact cards */}
        <div className="space-y-2 lg:hidden">
          {shown.map((l) => (
            <LeadCard key={l.id} lead={l} />
          ))}
        </div>

        {/* Computer: a table */}
        {shown.length > 0 && (
          <div className="hidden overflow-hidden rounded-2xl bg-card lg:block">
            <table className="w-full text-left text-[14px]">
              <thead className="border-b border-hairline text-[12px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="px-2 py-2.5 font-semibold">Company</th>
                  <th className="px-2 py-2.5 font-semibold">Stage</th>
                  <th className="px-2 py-2.5 font-semibold">Next follow-up</th>
                  <th className="px-2 py-2.5 font-semibold">Last contacted</th>
                  <th className="px-2 py-2.5 font-semibold">Assigned</th>
                  <th className="px-4 py-2.5 font-semibold">
                    <span className="sr-only">Call</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.id} className="border-b border-hairline last:border-0 hover:bg-canvas">
                    <td className="px-4 py-2">
                      <Link to={`/sales/leads/${l.id}`} className="font-semibold text-ink hover:underline">
                        {l.name}
                      </Link>
                      {l.phone && <span className="block text-[13px] text-muted">{l.phone}</span>}
                    </td>
                    <td className="px-2 py-2">
                      {l.org?.name}
                      {l.org && <span className="block text-[13px] text-muted">{orgTypeLabels[l.org.org_type]}</span>}
                    </td>
                    <td className="px-2 py-2">
                      <StagePill stage={l.stage} />
                    </td>
                    <td className="px-2 py-2">
                      {l.follow_up ? <FollowUpLine lead={l} /> : <span className="text-muted">None</span>}
                    </td>
                    <td className="px-2 py-2 text-muted">
                      {l.last_contacted_at
                        ? `${friendlyDate(todayISO(new Date(l.last_contacted_at)))}${l.last_contacted_by ? `, ${nameOf(l.last_contacted_by)}` : ''}`
                        : 'Never'}
                    </td>
                    <td className="px-2 py-2">
                      {l.assigned_to ? nameOf(l.assigned_to) : <span className="text-muted">Nobody</span>}
                    </td>
                    <td className="px-4 py-2">
                      <CallButton
                        lead={l}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Screen>
  )
}
