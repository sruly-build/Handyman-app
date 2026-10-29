import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { backend } from '../data/backend'
import { formatMoney, roundMoney } from '../data/billing'
import { refreshAll, useVendorWork } from '../data/queries'
import type { Contact } from '../data/types'
import { friendlyDate } from '../lib/dates'
import { CheckIcon } from './Icons'
import { Card, Divider, ErrorNote, GroupLabel, Loading, StatusBadge } from './ui'

/** Every item I've given a vendor: job, price, status, and whether I've paid them */
export function VendorHistory({ vendor }: { vendor: Contact }) {
  const { data: rows, isLoading, error } = useVendorWork(vendor.id)
  const qc = useQueryClient()
  const setPaid = useMutation({
    mutationFn: ({ itemId, paid }: { itemId: string; paid: boolean }) => backend.setVendorPaid(itemId, paid),
    onSettled: () => refreshAll(qc),
  })

  if (isLoading) return <Loading />
  if (error) return <ErrorNote error={error} />
  if (!rows || rows.length === 0) return null

  const mineToPay = rows.filter((r) => r.assignment.paid_by === 'me')
  const owed = roundMoney(
    mineToPay.filter((r) => !r.assignment.vendor_paid).reduce((s, r) => s + (r.assignment.price ?? 0), 0),
  )
  const paid = roundMoney(
    mineToPay.filter((r) => r.assignment.vendor_paid).reduce((s, r) => s + (r.assignment.price ?? 0), 0),
  )

  return (
    <section className="mb-6">
      <GroupLabel>Work you've given them</GroupLabel>
      <Card className="mb-3 grid grid-cols-3 divide-x divide-hairline py-3 text-center">
        <div className="px-1">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Items</p>
          <p className="text-[16px] font-bold">{rows.length}</p>
        </div>
        <div className="px-1">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">You owe</p>
          <p className={`truncate text-[16px] font-bold ${owed > 0 ? 'text-[#9a5300]' : ''}`}>{formatMoney(owed)}</p>
        </div>
        <div className="px-1">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Paid</p>
          <p className="truncate text-[16px] font-bold">{formatMoney(paid)}</p>
        </div>
      </Card>
      <Card>
        {rows.map(({ assignment: a, item, job }, i) => (
          <div key={a.id}>
            {i > 0 && <Divider />}
            <div className="flex items-center gap-2 py-3 pl-4 pr-3">
              <Link to={`/jobs/${a.job_id}/items/${a.id}`} className="min-w-0 flex-1 active:opacity-60">
                <p className="truncate text-[16px] font-semibold">{item?.title ?? 'Deleted item'}</p>
                <p className="truncate text-[14px] text-muted">
                  {job ? `${job.customer_name} · ${job.stage === 'lead' ? 'Lead' : friendlyDate(job.job_date)}` : ''}
                </p>
                <p className="mt-1 flex items-center gap-2 text-[14px]">
                  {item && <StatusBadge status={item.status} />}
                  <span className="font-semibold">{a.price != null ? formatMoney(a.price) : 'No price'}</span>
                </p>
              </Link>
              {a.paid_by === 'client' ? (
                <span className="shrink-0 text-right text-[13px] text-muted">
                  Client
                  <br />
                  pays them
                </span>
              ) : (
                <button
                  onClick={() => setPaid.mutate({ itemId: a.id, paid: !a.vendor_paid })}
                  disabled={setPaid.isPending}
                  aria-pressed={a.vendor_paid}
                  className={`flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-[14px] font-semibold ${
                    a.vendor_paid ? 'bg-brand-soft text-brand-dark' : 'bg-progress-soft text-[#8a4b00]'
                  }`}
                >
                  {a.vendor_paid && <CheckIcon size={15} strokeWidth={3} />}
                  {a.vendor_paid ? 'Paid' : 'Unpaid'}
                </button>
              )}
            </div>
          </div>
        ))}
      </Card>
      {setPaid.error && <ErrorNote error={setPaid.error} />}
      {mineToPay.length > 0 && <p className="mt-1.5 px-4 text-[13px] text-muted">Tap Unpaid or Paid to change it.</p>}
    </section>
  )
}
