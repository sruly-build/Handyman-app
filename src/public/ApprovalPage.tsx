import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckIcon, PhoneIcon } from '../components/Icons'
import { Button, Card, Divider, ErrorNote, Loading, TextArea } from '../components/ui'
import { publicApi } from '../data/backend'
import { money } from '../data/requests'
import { phoneLink } from '../lib/links'
import { PublicShell } from './PublicShell'

/** /a/<token>: the landlord approves or declines a repair (no login) */
export function ApprovalPage() {
  const { token = '' } = useParams()
  const { data: a, isLoading, error, refetch } = useQuery({ queryKey: ['approval', token], queryFn: () => publicApi.approval(token), retry: false })
  const { data: photos = [] } = useQuery({ queryKey: ['approvalPhotos', token], queryFn: () => publicApi.approvalPhotos(token), enabled: Boolean(a) })
  const [note, setNote] = useState('')
  const decide = useMutation({
    mutationFn: (approve: boolean) => publicApi.decide(token, approve, note),
    onSuccess: (result) => {
      if (result === 'approved' && a?.kind === 'parts') void publicApi.decided(token)
      void refetch()
    },
  })

  if (isLoading) return <PublicShell title="Approve a repair" lang="en"><Loading /></PublicShell>
  if (error || !a) {
    return (
      <PublicShell title="Approve a repair" lang="en">
        {error ? <ErrorNote error={error} /> : <p className="text-[17px]">This link doesn't work any more. Please call us.</p>}
      </PublicShell>
    )
  }
  const decided = a.status !== 'pending'
  const partsTotal = a.parts.reduce((sum, p) => sum + p.price * p.qty, 0)

  return (
    <PublicShell title={a.kind === 'parts' ? 'Approve parts' : 'Approve a repair'} company={a.company} lang="en">
      <Card className="px-4 py-4">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">
          {a.address}
          {a.unit ? ` · ${a.unit}` : ''}
        </p>
        <p className="mt-1 text-[22px] font-bold leading-tight">{a.title}</p>
        {a.details && <p className="mt-2 whitespace-pre-wrap text-[16px]">{a.details}</p>}
        {a.issues.length > 0 && <p className="mt-2 text-[15px] text-muted">Reported: {a.issues.join(', ')}</p>}
        {a.description && a.description !== a.details && <p className="mt-1 text-[15px] text-muted">“{a.description}”</p>}
      </Card>

      {photos.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {photos.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-xl bg-hairline">
              <img src={url} alt="" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}

      <Card className="mt-3">
        {a.estimate_hours != null && (
          <Row label="Time" value={`About ${a.estimate_hours} hour${a.estimate_hours === 1 ? '' : 's'}`} />
        )}
        {a.parts.map((p, i) => (
          <div key={i}>
            <Divider />
            <Row label={`${p.qty} × ${p.name}`} value={money(p.price * p.qty)} />
          </div>
        ))}
        {(a.estimate_amount != null || partsTotal > 0) && (
          <>
            <Divider />
            <Row label="Estimate" value={money(a.estimate_amount ?? partsTotal)} bold />
          </>
        )}
        {a.estimate_hours == null && a.estimate_amount == null && !a.parts.length && <Row label="Estimate" value="We'll confirm before starting" />}
      </Card>

      {decided ? (
        <Card className="mt-5 px-5 py-6 text-center">
          <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full text-white ${a.status === 'approved' ? 'bg-brand' : 'bg-muted'}`}>
            <CheckIcon size={26} strokeWidth={3} />
          </span>
          <p className="mt-3 text-[20px] font-bold">
            {a.status === 'approved' ? 'Approved. Thank you!' : a.status === 'declined' ? 'Declined. Thanks for letting us know.' : 'This request was cancelled.'}
          </p>
          {a.decided_at && <p className="text-[15px] text-muted">{new Date(a.decided_at).toLocaleString()}</p>}
        </Card>
      ) : a.expired ? (
        <p className="mt-5 text-[17px]">This link has expired. Please call us.</p>
      ) : (
        <>
          <Card className="mt-5">
            <TextArea label="Note for us (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Card>
          {decide.error && <div className="mt-3"><ErrorNote error={decide.error} /></div>}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button variant="secondary" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
              Decline
            </Button>
            <Button disabled={decide.isPending} onClick={() => decide.mutate(true)}>
              Approve
            </Button>
          </div>
          {a.kind === 'parts' && <p className="mt-2 px-1 text-[13px] text-muted">Approved parts are charged to the card on file for your plan.</p>}
        </>
      )}

      {a.phone && (
        <a href={phoneLink(a.phone)} className="mt-6 flex min-h-12 items-center justify-center gap-2 text-[17px] font-semibold text-brand">
          <PhoneIcon size={20} /> Questions? Call us
        </a>
      )}
    </PublicShell>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex min-h-12 items-center gap-3 px-4 py-2 ${bold ? 'font-bold' : ''}`}>
      <span className="min-w-0 flex-1 text-[16px]">{label}</span>
      <span className="text-[17px]">{value}</span>
    </div>
  )
}
