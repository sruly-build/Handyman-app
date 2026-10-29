import { Link } from 'react-router-dom'
import { formatMoney, roundMoney } from '../data/billing'
import { useClientJobs } from '../data/queries'
import type { Contact } from '../data/types'
import { friendlyDate } from '../lib/dates'
import { ChevronIcon, PlusIcon } from './Icons'
import { Card, Divider, ErrorNote, GroupLabel, Loading } from './ui'

/** A client's jobs: what was done, what it cost, what's paid and owed */
export function ClientHistory({ client }: { client: Contact }) {
  const { data: rows, isLoading, error } = useClientJobs(client.id)
  const first = (client.name || client.business).split(/\s+/)[0]

  const billed = roundMoney((rows ?? []).reduce((s, r) => s + (r.invoice ? Number(r.invoice.total) : 0), 0))
  const paid = roundMoney((rows ?? []).reduce((s, r) => s + r.paid, 0))
  const owed = roundMoney(
    (rows ?? []).reduce((s, r) => s + (r.invoice ? Math.max(0, Number(r.invoice.total) - r.paid) : 0), 0),
  )

  return (
    <section className="mb-6">
      <GroupLabel>Jobs and history</GroupLabel>
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {rows && rows.length > 0 && (
        <>
          <Card className="mb-3 grid grid-cols-4 divide-x divide-hairline py-3 text-center">
            <Stat label="Jobs" value={String(rows.length)} />
            <Stat label="Billed" value={formatMoney(billed)} />
            <Stat label="Paid" value={formatMoney(paid)} />
            <Stat label="Owed" value={formatMoney(owed)} warn={owed > 0} />
          </Card>
          <Card className="mb-3">
            {rows.map((r, i) => {
              const titles = r.items.map((it) => it.title)
              const work = titles.length > 3 ? `${titles.slice(0, 3).join(', ')} and ${titles.length - 3} more` : titles.join(', ')
              const due = r.invoice ? roundMoney(Number(r.invoice.total) - r.paid) : 0
              return (
                <div key={r.job.id}>
                  {i > 0 && <Divider />}
                  <Link to={`/jobs/${r.job.id}`} className="flex items-center gap-2 py-3 pl-4 pr-3 active:bg-canvas">
                    <div className="min-w-0 flex-1">
                      <p className="text-[16px] font-semibold">
                        {r.job.stage === 'lead'
                          ? `Lead${r.job.lead_status === 'lost' ? ' (lost)' : ''}`
                          : friendlyDate(r.job.job_date)}
                      </p>
                      {r.job.address && <p className="truncate text-[14px] text-muted">{r.job.address}</p>}
                      <p className="text-[14px]">{work || 'No punch list items'}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {r.invoice ? (
                        <>
                          <p className="text-[16px] font-semibold">{formatMoney(Number(r.invoice.total))}</p>
                          <p className={`text-[13px] font-semibold ${due > 0 ? 'text-[#9a5300]' : 'text-brand-dark'}`}>
                            {due > 0 ? `${formatMoney(due)} due` : 'Paid'}
                          </p>
                        </>
                      ) : (
                        <p className="text-[13px] text-muted">
                          No invoice yet
                          {r.paid > 0 && (
                            <>
                              <br />
                              {formatMoney(r.paid)} deposit
                            </>
                          )}
                        </p>
                      )}
                    </div>
                    <ChevronIcon size={18} className="shrink-0 text-[#c7c7cc]" />
                  </Link>
                </div>
              )
            })}
          </Card>
        </>
      )}
      {rows && rows.length === 0 && <p className="mb-3 px-4 text-[15px] text-muted">No jobs for {first} yet.</p>}
      <Link
        to={`/jobs/new?client=${client.id}`}
        className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-brand-soft text-[17px] font-semibold text-brand-dark active:opacity-70"
      >
        <PlusIcon size={22} strokeWidth={2.6} />
        New job for {first}
      </Link>
    </section>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="min-w-0 px-1">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`truncate text-[16px] font-bold ${warn ? 'text-[#9a5300]' : ''}`}>{value}</p>
    </div>
  )
}
