import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { backend } from '../data/backend'
import { formatMoney } from '../data/billing'
import { useBillLink } from '../data/queries'
import type { Company, Invoice, InvoiceLine, Job } from '../data/types'
import { LinkIcon, MailIcon, MessageIcon } from './Icons'
import { Card, ErrorNote, TextArea } from './ui'

const NOTE_KEY = 'bill-link-note'

/** WhatsApp wants the number with its country code (US numbers get a 1) */
function whatsappNumber(phone: string) {
  const d = phone.replace(/\D/g, '')
  return d.length === 10 ? `1${d}` : d
}

const timeAgo = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/**
 * Send the customer a live link to their estimate or invoice: a page with
 * every line, discounts, payments and what's due, always the latest.
 */
export function LiveBillLink({
  job,
  company,
  invoice,
  estimate,
}: {
  job: Job
  company: Company
  invoice: Invoice | null
  /** The current estimate (kept fresh on the page until there's an invoice) */
  estimate: { lines: InvoiceLine[]; total: number }
}) {
  const qc = useQueryClient()
  const { data: link, isLoading } = useBillLink(job.id)
  const [note, setNote] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: ['billLink', job.id] })

  const create = useMutation({
    mutationFn: () => {
      let saved = ''
      try {
        saved = localStorage.getItem(NOTE_KEY) ?? ''
      } catch {
        // fine
      }
      return backend.createBillLink(job.id, estimate, saved)
    },
    onSuccess: () => void refresh(),
  })
  const saveNote = useMutation({
    mutationFn: (value: string) => {
      try {
        localStorage.setItem(NOTE_KEY, value)
      } catch {
        // fine
      }
      return backend.updateBillLink(job.id, { note: value })
    },
    onSuccess: () => void refresh(),
  })
  const turnOff = useMutation({ mutationFn: () => backend.deleteBillLink(job.id), onSuccess: () => void refresh() })

  // Keep the estimate on the customer's page up to date
  const estimateKey = JSON.stringify(estimate)
  useEffect(() => {
    if (!link || invoice || JSON.stringify({ lines: link.estimate.lines, total: link.estimate.total }) === estimateKey) return
    const t = setTimeout(() => void backend.updateBillLink(job.id, { estimate: JSON.parse(estimateKey) }).then(refresh), 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link, invoice, estimateKey, job.id])

  if (isLoading) return null
  if (!link) {
    return (
      <Card className="mt-3 p-3 print:hidden">
        <button
          type="button"
          disabled={create.isPending}
          onClick={() => create.mutate()}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[16px] font-semibold text-white active:scale-[0.98] disabled:opacity-50"
        >
          <LinkIcon size={18} /> {create.isPending ? 'Making the link…' : `Send ${invoice ? 'invoice' : 'estimate'} as a live link`}
        </button>
        <p className="mt-1.5 px-1 text-center text-[13px] text-muted">The customer sees every price and discount, always up to date.</p>
        {create.error && <ErrorNote error={create.error} />}
      </Card>
    )
  }

  const url = `${window.location.origin}/b/${link.token}`
  const first = job.customer_name.split(/\s+/)[0] || 'there'
  const what = invoice ? `invoice #${invoice.number}` : 'estimate'
  const amount = formatMoney(Number(invoice ? invoice.total : estimate.total))
  const message = `Hi ${first}, here's your ${what} from ${company.name || 'us'} (${amount}). You can see every line and discount here: ${url}`
  const phone = job.customer_phone
  const btn = 'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[12px] font-semibold active:scale-[0.97]'

  return (
    <Card className="mt-3 p-3 print:hidden">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[15px] font-semibold">Live link for the customer</p>
        <a href={`${url}?preview=1`} target="_blank" rel="noreferrer" className="text-[14px] font-semibold text-brand">
          Preview
        </a>
      </div>
      <p className="truncate px-1 text-[13px] text-muted">{url}</p>
      <p className={`px-1 text-[13px] font-medium ${link.viewed_at ? 'text-brand-dark' : 'text-muted'}`}>
        {link.viewed_at ? `Opened ${link.view_count} time${link.view_count === 1 ? '' : 's'} · last ${timeAgo(link.viewed_at)}` : 'Not opened yet'}
      </p>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        <a href={`https://wa.me/${phone ? whatsappNumber(phone) : ''}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className={`${btn} bg-[#25d366] text-white`}>
          <MessageIcon size={17} /> WhatsApp
        </a>
        <a href={`sms:${phone}?&body=${encodeURIComponent(message)}`} className={`${btn} bg-canvas text-ink`}>
          <MessageIcon size={17} /> Text
        </a>
        <a
          href={`mailto:${job.customer_email}?subject=${encodeURIComponent(`Your ${what} from ${company.name || 'us'}`)}&body=${encodeURIComponent(message)}`}
          className={`${btn} bg-canvas text-ink`}
        >
          <MailIcon size={17} /> Email
        </a>
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard?.writeText(url).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            })
          }
          className={`${btn} bg-canvas text-ink`}
        >
          <LinkIcon size={17} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="mt-2 rounded-xl bg-canvas">
        <TextArea
          label="How to pay (shown on the page, optional)"
          rows={2}
          value={note ?? link.note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note != null && note !== link.note && saveNote.mutate(note)}
          placeholder="e.g. Zelle 732-555-0100, or a check to Dave's Handyman"
        />
      </div>
      {saveNote.error && <ErrorNote error={saveNote.error} />}
      <button
        type="button"
        onClick={() => confirm('Turn off this link? The customer will no longer be able to open it.') && turnOff.mutate()}
        className="mt-1 min-h-10 w-full text-[13px] text-muted"
      >
        Turn off link
      </button>
    </Card>
  )
}
