import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ExtraCharges, Payments, syncInvoicePaid } from '../components/BillExtras'
import { BeforeAfterList, DocHeader, LinesTable, Paper, PrintButton } from '../components/Documents'
import { Screen } from '../components/Screen'
import { Button, Card, ErrorNote, Loading, Segmented, Toggle } from '../components/ui'
import { backend } from '../data/backend'
import { buildBill, formatMoney, invoiceLines, paymentSummary, type Bill } from '../data/billing'
import {
  refreshAll,
  useCharges,
  useCompany,
  useInvoice,
  useItems,
  useJob,
  useJobPhotos,
  useParts,
  usePayments,
  useSettings,
  useTime,
  useAssignments,
} from '../data/queries'

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

/** Estimate (from expected hours) and invoice (from tracked time) for one job */
export function BillScreen() {
  const { jobId = '' } = useParams()
  const { data: job, error } = useJob(jobId)
  const { data: items } = useItems(jobId)
  const { data: parts } = useParts(jobId)
  const { data: entries } = useTime(jobId)
  const { data: settings } = useSettings()
  const { data: company } = useCompany()
  const { data: invoice, isLoading: invoiceLoading } = useInvoice(jobId)
  const { data: photos = [] } = useJobPhotos(jobId)
  const { data: charges } = useCharges(jobId)
  const { data: payments } = usePayments(jobId)
  const { data: assignments } = useAssignments(jobId)
  const [tab, setTab] = useState<'estimate' | 'invoice' | null>(null)
  const [withPhotos, setWithPhotos] = useState(false)
  const qc = useQueryClient()

  const create = useMutation({
    mutationFn: async () => {
      const bill = buildBill(
        {
          items: items!,
          parts: parts!,
          entries: entries!,
          settings: settings!,
          job,
          charges,
          assignments,
          now: Date.now(),
        },
        'actual',
      )
      const created = await backend.createInvoice(jobId, {
        lines: invoiceLines(bill),
        parts_total: bill.partsTotal,
        labour_total: bill.labourTotal,
        total: bill.total,
        markup_percent: bill.partsMarkup,
      })
      // A deposit may already cover it
      await syncInvoicePaid(created, payments ?? [])
    },
    onSettled: () => refreshAll(qc),
  })
  const setMaterialsMarkup = useMutation({
    mutationFn: (on: boolean) => backend.updateJob(jobId, { markup_parts: on }),
    onSettled: () => refreshAll(qc),
  })
  const remove = useMutation({
    mutationFn: () => backend.deleteInvoice(invoice!.id),
    onSettled: () => refreshAll(qc),
  })

  const back = { to: `/jobs/${jobId}`, label: job?.stage === 'lead' ? 'Lead' : 'Job' }
  if (
    error ||
    !job ||
    !items ||
    !parts ||
    !entries ||
    !settings ||
    !company ||
    !charges ||
    !payments ||
    !assignments ||
    invoiceLoading
  ) {
    return (
      <Screen title="Billing" back={back}>
        {error ? <ErrorNote error={error} /> : <Loading />}
      </Screen>
    )
  }

  // A lead only has an estimate (the invoice comes once it's a job)
  const lead = job.stage === 'lead'
  const shown = lead ? 'estimate' : (tab ?? (invoice ? 'invoice' : 'estimate'))
  const input = { items, parts, entries, settings, job, charges, assignments, now: Date.now() }
  const { paid } = paymentSummary(0, payments)
  const estimate = buildBill(input, 'estimate')
  const actual = buildBill(input, 'actual')
  // Items a vendor is doing don't need my hours
  const missingHours = items.filter((i) => !i.estimated_hours && !assignments.some((a) => a.id === i.id)).length
  const shownBill = shown === 'estimate' ? estimate : actual
  const notDone = items.filter((i) => i.status !== 'done').length
  const rates =
    estimate.firstRate !== null
      ? `First hour ${formatMoney(estimate.firstRate)}, then ${formatMoney(estimate.rate)}/hour`
      : `Labour at ${formatMoney(estimate.rate)}/hour`
  const rateNote = `${rates}${settings.labour_mode === 'visit' ? ', from arrival to finish' : ', per task'}, 1 hour minimum.`
  const materialsMarkupOn = (job.markup_parts ?? settings.markup_parts) === true

  return (
    <Screen title="Billing" eyebrow={job.customer_name} back={back}>
      <div className="print:hidden">
        {!lead && (
          <Segmented
            label="Show"
            value={shown}
            onChange={setTab}
            options={[
              { value: 'estimate', label: 'Estimate' },
              { value: 'invoice', label: invoice ? `Invoice #${invoice.number}` : 'Invoice' },
            ]}
          />
        )}
        {!invoice && (
          <Card className="mt-3">
            <Toggle
              label={`Add ${settings.markup_percent}% markup to materials`}
              hint={
                materialsMarkupOn
                  ? `Parts cost ${formatMoney(estimate.partsCost)}, customer pays ${formatMoney(estimate.partsTotal)}`
                  : `Customer pays what you paid: ${formatMoney(estimate.partsCost)}`
              }
              checked={materialsMarkupOn}
              onChange={(on) => setMaterialsMarkup.mutate(on)}
            />
          </Card>
        )}
        {setMaterialsMarkup.error && <ErrorNote error={setMaterialsMarkup.error} />}
      </div>

      {shown === 'estimate' && (
        <div className="mt-4 space-y-4">
          {missingHours > 0 && (
            <p className="rounded-2xl bg-progress-soft px-4 py-3 text-[14px] text-[#9a5300] print:hidden">
              {missingHours} {missingHours === 1 ? 'item has' : 'items have'} no expected time, so no labour is included
              for {missingHours === 1 ? 'it' : 'them'}. Add the hours on each item.
            </p>
          )}
          <Paper>
            <DocHeader title="Estimate" subtitle={longDate(new Date().toISOString())} job={job} company={company} />
            <LinesTable lines={invoiceLines(estimate)} total={estimate.total} />
            <p className="mt-4 text-[13px] text-muted">
              {rates}, 1 hour minimum. This is an estimate; the final bill is based on the actual time and parts.
            </p>
          </Paper>
          <PrintButton />
        </div>
      )}

      {shown === 'invoice' && !invoice && (
        <div className="mt-4 space-y-4">
          <Card className="p-4">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">Bill so far (tracked time)</p>
            <p className="text-[34px] font-bold">{formatMoney(actual.total)}</p>
            <p className="text-[15px] text-muted">
              Estimate was {formatMoney(estimate.total)}. {rateNote}
            </p>
          </Card>
          <Paper>
            <LinesTable lines={invoiceLines(actual)} total={actual.total} paid={paid} />
          </Paper>
          {notDone > 0 && (
            <p className="px-2 text-[14px] text-[#9a5300]">
              {notDone} {notDone === 1 ? 'item is' : 'items are'} not marked done yet.
            </p>
          )}
          {create.error && <ErrorNote error={create.error} />}
          <Button
            disabled={create.isPending}
            onClick={() =>
              (notDone === 0 || confirm('Some items are not done yet. Create the invoice anyway?')) && create.mutate()
            }
          >
            {create.isPending ? 'Creating…' : 'Create invoice'}
          </Button>
          <p className="px-2 text-center text-[13px] text-muted">
            The invoice keeps these amounts even if times or parts change later (extra charges below still update it).
            Change the markup and hourly rate in{' '}
            <Link to="/settings" className="text-brand">
              Prices
            </Link>
            .
          </p>
        </div>
      )}

      {shown === 'invoice' && invoice && (
        <div className="mt-4 space-y-4">
          <Paper>
            <DocHeader
              title={`Invoice #${invoice.number}`}
              subtitle={`${longDate(invoice.created_at)}${invoice.status === 'paid' ? ' · PAID' : ''}`}
              job={job}
              company={company}
            />
            <LinesTable lines={invoice.lines} total={Number(invoice.total)} paid={paid} />
            {withPhotos && (
              <div className="mt-6 border-t border-hairline pt-4">
                <p className="mb-3 text-[17px] font-bold">Before and after</p>
                <BeforeAfterList items={items} photos={photos} />
              </div>
            )}
            <p className="mt-4 text-[14px] text-muted">Thank you for your business!</p>
          </Paper>

          <Card className="print:hidden">
            <Toggle label="Include before and after photos" checked={withPhotos} onChange={setWithPhotos} />
          </Card>
          <PrintButton />
          <Button
            variant="danger"
            className="print:hidden"
            disabled={remove.isPending}
            onClick={() =>
              confirm('Delete this invoice so you can make a new one from the latest times and parts?') &&
              remove.mutate()
            }
          >
            Delete invoice and start over
          </Button>
        </div>
      )}

      <VendorNotes bill={shownBill} />

      <div className="mt-8 space-y-8">
        <ExtraCharges jobId={jobId} invoice={invoice ?? null} />
        {shown === 'invoice' && <Payments jobId={jobId} invoice={invoice ?? null} billTotal={actual.total} />}
      </div>
    </Screen>
  )
}

/** Only for me (not printed): what vendors cost, and items the client pays a vendor for directly */
function VendorNotes({ bill }: { bill: Bill }) {
  if (bill.vendorTotal === 0 && bill.clientPaid.length === 0) return null
  return (
    <div className="mt-4 space-y-2 print:hidden">
      {bill.vendorTotal > 0 && (
        <p className="rounded-2xl bg-card px-4 py-3 text-[14px] text-muted">
          Vendors (only you see this): they charge you {formatMoney(bill.vendorCost)}, the client pays{' '}
          {formatMoney(bill.vendorTotal)}.
        </p>
      )}
      {bill.clientPaid.length > 0 && (
        <div className="rounded-2xl bg-card px-4 py-3 text-[14px]">
          <p className="font-semibold">Paid by the client directly (not on this bill)</p>
          {bill.clientPaid.map((c) => (
            <p key={c.itemId} className="text-muted">
              {c.title}: {c.name}
              {c.price != null ? `, ${formatMoney(c.price)}` : ''}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
