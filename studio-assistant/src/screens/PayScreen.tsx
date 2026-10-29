import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { isLive } from '../lib/cloud'
import { startCardPayment, usePayView } from '../lib/publicData'
import { InvoiceDocument } from '../components/InvoiceDocument'
import { Empty } from '../components/ui'

// The page a client opens from an invoice link: see it and pay it. No login.
export function PayScreen() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const { data, error } = usePayView(id)
  const [busy, setBusy] = useState(false)
  const [payError, setPayError] = useState('')

  if (!data)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        {error ? <Empty title="Invoice not available" text={error} /> : <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-accent" />}
      </div>
    )

  const payCard = async () => {
    setBusy(true)
    setPayError('')
    try {
      location.href = await startCardPayment(id)
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Card payment is not available right now.')
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 py-6 sm:py-10">
      {params.get('paid') && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-green-soft p-4 text-green">
          <CheckCircle2 className="shrink-0" />
          <div className="text-[15px] font-medium">Thank you! Your payment went through. A receipt is on its way to your email.</div>
        </div>
      )}
      {payError && <div className="mb-4 rounded-2xl bg-red-soft p-4 text-[14px] text-red">{payError}</div>}
      <InvoiceDocument
        inv={data.invoice}
        cardFeePct={data.settings.cardFeePct}
        studio={data.studio}
        client={data.client}
        pay={data.pay}
        cardEnabled={data.pay.cardEnabled || !isLive}
        onPayCard={isLive ? payCard : undefined}
        payBusy={busy}
      />
      <p className="mt-6 text-center text-[12px] text-ink-3">
        Questions? Contact {data.studio.businessName}
        {data.studio.email && ` at ${data.studio.email}`}.
      </p>
    </div>
  )
}
