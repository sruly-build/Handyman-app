import { formatMoney } from '../data/billing'
import { formatDuration } from '../data/time'
import type { Company, InvoiceLine, Job, Photo, PunchItem } from '../data/types'
import { PrintIcon } from './Icons'
import { Card, StatusBadge } from './ui'

/** Business and customer details at the top of an estimate, invoice or report */
export function DocHeader({
  title,
  subtitle,
  job,
  company,
}: {
  title: string
  subtitle: string
  job: Job
  /** The business whose estimate, invoice or report this is */
  company: Company
}) {
  return (
    <div className="flex flex-wrap justify-between gap-4 border-b border-hairline pb-4">
      <div>
        <p className="text-[22px] font-bold text-brand">{company.name || 'Your business name'}</p>
        <p className="whitespace-pre-line text-[14px] text-muted">
          {[company.address, company.phone, company.email].filter(Boolean).join('\n')}
        </p>
      </div>
      <div className="text-right">
        <p className="text-[20px] font-bold uppercase tracking-wide">{title}</p>
        <p className="text-[14px] text-muted">{subtitle}</p>
      </div>
      <div className="w-full">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">For</p>
        <p className="text-[17px] font-semibold">{job.customer_name}</p>
        <p className="whitespace-pre-line text-[14px] text-muted">
          {[job.address, job.customer_phone, job.customer_email].filter(Boolean).join('\n')}
        </p>
      </div>
    </div>
  )
}

/** Table of lines and totals */
export function LinesTable({
  lines,
  partsTotal,
  labourTotal,
  total,
}: {
  lines: InvoiceLine[]
  partsTotal: number
  labourTotal: number
  total: number
}) {
  const qty = (l: InvoiceLine) =>
    l.kind === 'labour' ? formatDuration(l.quantity * 3_600_000) : l.kind === 'part' ? (l.quantity !== 1 ? `× ${l.quantity}` : '') : ''
  return (
    <div>
      <table className="mt-4 w-full text-[15px]">
        <thead>
          <tr className="border-b border-hairline text-left text-[12px] uppercase tracking-wide text-muted">
            <th className="pb-2 font-semibold">Description</th>
            <th className="pb-2 text-right font-semibold">Qty</th>
            <th className="pb-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-hairline align-top">
              <td className={`py-2 pr-2 ${l.kind === 'part' ? 'pl-3' : ''}`}>
                <span className={l.kind === 'part' ? '' : 'font-semibold'}>{l.description}</span>
                {l.kind !== 'part' && l.detail && <span className="block text-[13px] text-muted">{l.detail}</span>}
              </td>
              <td className="whitespace-nowrap py-2 text-right text-muted">{qty(l)}</td>
              <td className="whitespace-nowrap py-2 pl-2 text-right">
                {/* Work done shows no price of its own; labour is charged on the service call lines */}
                {l.kind === 'work' ? '' : formatMoney(l.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto mt-3 max-w-xs space-y-1 text-[15px]">
        <div className="flex justify-between">
          <span className="text-muted">Labour</span>
          <span>{formatMoney(labourTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Parts and materials</span>
          <span>{formatMoney(partsTotal)}</span>
        </div>
        <div className="flex justify-between border-t border-ink pt-2 text-[19px] font-bold">
          <span>Total</span>
          <span>{formatMoney(total)}</span>
        </div>
      </div>
    </div>
  )
}

/** Before and after pictures side by side for each item */
export function BeforeAfterList({ items, photos, showEmpty = false }: { items: PunchItem[]; photos: Photo[]; showEmpty?: boolean }) {
  const rows = items
    .map((item) => ({
      item,
      before: photos.filter((p) => p.item_id === item.id && p.kind === 'before'),
      after: photos.filter((p) => p.item_id === item.id && p.kind === 'after'),
    }))
    .filter((r) => showEmpty || r.before.length || r.after.length)

  if (rows.length === 0) {
    return <p className="py-6 text-center text-[15px] text-muted">No before or after photos yet.</p>
  }
  return (
    <div className="space-y-6">
      {rows.map(({ item, before, after }) => (
        <div key={item.id} className="break-inside-avoid">
          <div className="mb-2 flex items-center gap-2">
            <p className="flex-1 text-[17px] font-semibold">
              {item.title}
              {item.location && <span className="font-normal text-muted"> · {item.location}</span>}
            </p>
            <StatusBadge status={item.status} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['Before', 'After'] as const).map((label) => {
              const list = label === 'Before' ? before : after
              return (
                <div key={label}>
                  <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted">{label}</p>
                  {list.length === 0 ? (
                    <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-canvas text-[13px] text-muted">
                      No photo
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {list.map((p) => (
                        <img key={p.id} src={p.url} alt={`${label} photo`} className="aspect-[4/3] w-full rounded-xl object-cover" />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Paper-like card that prints cleanly */
export function Paper({ children }: { children: React.ReactNode }) {
  return <Card className="p-5 print:rounded-none print:p-0 print:shadow-none">{children}</Card>
}

export function PrintButton({ label = 'Print or save as PDF' }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand-soft text-[17px] font-semibold text-brand-dark active:opacity-70 print:hidden"
    >
      <PrintIcon size={22} />
      {label}
    </button>
  )
}
