import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { backend } from '../data/backend'
import { refreshAll, useCompany } from '../data/queries'
import { approvalMessage, issueSummary } from '../data/requests'
import type { Approval, ServiceRequest } from '../data/types'
import { ReadyTextSheet } from './ReadyText'
import { Sheet } from './Sales'
import { Button, Card, Divider, ErrorNote, Field, TextArea } from './ui'

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/[^0-9.]/g, '')) || null)

/**
 * Ask the landlord to approve a repair: fill in the estimate, then send the
 * secure link by text or WhatsApp from your own phone.
 */
export function ApprovalSheet({
  request,
  landlordName,
  landlordPhone,
  onClose,
}: {
  request: ServiceRequest
  landlordName: string
  landlordPhone: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { data: company } = useCompany()
  const [title, setTitle] = useState(issueSummary(request))
  const [details, setDetails] = useState(request.description)
  const [hours, setHours] = useState('')
  const [amount, setAmount] = useState('')
  const [phone, setPhone] = useState(landlordPhone)
  const [made, setMade] = useState<Approval | null>(null)
  const create = useMutation({
    mutationFn: () =>
      backend.createApproval({
        request, kind: 'repair', title, details, estimate_hours: num(hours), estimate_amount: num(amount), parts: [],
      }),
    onSuccess: (a) => {
      void refreshAll(qc)
      setMade(a)
    },
  })
  if (made) {
    return (
      <ReadyTextSheet
        phone={phone}
        title={`Send to ${landlordName.split(/\s+/)[0] || 'the landlord'}`}
        choices={[{ label: 'Approval link', text: approvalMessage(landlordName, request.address, made.title, made.token, company?.name ?? '') }]}
        onClose={onClose}
      />
    )
  }
  return (
    <Sheet title="Ask the landlord" onClose={onClose}>
      <Card className="bg-canvas">
        <Field label="What needs their OK" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Divider />
        <TextArea label="Details (optional)" rows={2} value={details} onChange={(e) => setDetails(e.target.value)} />
        <Divider />
        <div className="grid grid-cols-2">
          <Field label="Estimate (hours)" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
          <Field label="Estimate ($)" inputMode="decimal" className="border-l border-hairline" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <Divider />
        <Field label="Landlord's phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Card>
      <p className="mt-1.5 px-1 text-[13px] text-muted">They get a link with the photos and Approve / Decline buttons. No login needed.</p>
      {create.error && <div className="mt-2"><ErrorNote error={create.error} /></div>}
      <Button className="mt-4" disabled={!title.trim() || !phone.trim() || create.isPending} onClick={() => create.mutate()}>
        {create.isPending ? 'Making the link…' : 'Make the link'}
      </Button>
    </Sheet>
  )
}
