import { Link, useParams } from 'react-router-dom'
import { PlusIcon } from '../components/Icons'
import { PartRow } from '../components/PartRow'
import { Screen } from '../components/Screen'
import { Card, Divider, EmptyState, Loading } from '../components/ui'
import { formatMoney, partsMarkup, withMarkup } from '../data/billing'
import { useAssignments, useItems, useJob, useParts, useSettings } from '../data/queries'
import { isPartnerJob } from '../data/api'
import { useUser } from '../lib/auth'

/** Everything ordered for one job, and what was paid */
export function JobPartsScreen() {
  const { jobId = '' } = useParams()
  const { data: job } = useJob(jobId)
  // Another company's job: what to buy, without costs
  const shared = job ? isPartnerJob(job, useUser()) : false
  const { data: parts, isLoading } = useParts(jobId, shared, Boolean(job))
  const { data: assignments = [] } = useAssignments(jobId, Boolean(job) && !shared)
  const vendorName = (itemId: string | null) => assignments.find((a) => a.id === itemId)?.name
  const { data: items = [] } = useItems(jobId)
  const { data: settings } = useSettings()
  const titleOf = (id: string | null) => items.find((i) => i.id === id)?.title ?? 'Whole job'

  const mine = (parts ?? []).filter((p) => !p.vendor_orders)
  const bought = mine.filter((p) => p.status !== 'needed')
  const paid = bought.reduce((s, p) => s + (p.cost ?? 0), 0)
  const allCost = mine.reduce((s, p) => s + (p.cost ?? 0), 0)

  return (
    <Screen
      title={shared ? 'Parts to buy' : 'Parts'}
      eyebrow={job?.customer_name}
      back={{ to: `/jobs/${jobId}`, label: 'Job' }}
    >
      {isLoading && <Loading />}
      {parts && parts.length === 0 && (
        <EmptyState title="No parts yet">Add parts here or on each punch list item.</EmptyState>
      )}
      {parts && parts.length > 0 && (
        <>
          {!shared && (
            <div className="mb-4 grid grid-cols-2 gap-3">
              <Card className="p-4">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">Paid so far</p>
                <p className="text-[24px] font-bold">{formatMoney(paid)}</p>
                <p className="text-[13px] text-muted">{bought.length} ordered or received</p>
              </Card>
              <Card className="p-4">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">Customer pays</p>
                <p className="text-[24px] font-bold text-brand">
                  {formatMoney(settings ? withMarkup(allCost, partsMarkup(settings, job)) : allCost)}
                </p>
                <p className="text-[13px] text-muted">all parts, with markup</p>
              </Card>
            </div>
          )}
          <Card>
            {parts.map((p, i) => (
              <div key={p.id}>
                {i > 0 && <Divider />}
                <PartRow part={p} context={titleOf(p.item_id)} shared={shared} vendorName={vendorName(p.item_id)} />
              </div>
            ))}
          </Card>
        </>
      )}
      <Link
        to={`/jobs/${jobId}/parts/new`}
        className="mt-3 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-brand-soft text-[17px] font-semibold text-brand-dark active:opacity-70"
      >
        <PlusIcon size={22} strokeWidth={2.6} />
        Add part
      </Link>
    </Screen>
  )
}
