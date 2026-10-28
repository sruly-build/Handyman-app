import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { CloseIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, GroupLabel, Loading } from '../components/ui'
import { backend } from '../data/backend'
import { refreshAll, useJob, useShares } from '../data/queries'

/** Share a job's punch list and photos with another company */
export function ShareJobScreen() {
  const { jobId = '' } = useParams()
  const { data: job } = useJob(jobId)
  const { data: shares, isLoading } = useShares(jobId)
  const [email, setEmail] = useState('')
  const [sharedWith, setSharedWith] = useState<string | null>(null)
  const qc = useQueryClient()

  const share = useMutation({
    mutationFn: (e: string) => backend.shareJob(jobId, e),
    onSuccess: (name) => {
      setSharedWith(name)
      setEmail('')
      void refreshAll(qc)
    },
  })
  const unshare = useMutation({
    mutationFn: (companyId: string) => backend.unshareJob(jobId, companyId),
    onSettled: () => refreshAll(qc),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setSharedWith(null)
    share.mutate(email)
  }

  return (
    <Screen title="Share job" eyebrow={job?.customer_name} back={{ to: `/jobs/${jobId}`, label: 'Job' }}>
      <div className="mb-5 rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-dark">
        The other company sees this job's <strong>punch list and photos</strong> and can update them. They never see
        your prices, parts, time, estimates or invoices.
      </div>

      {isLoading && <Loading />}
      {shares && shares.length > 0 && (
        <section className="mb-6">
          <GroupLabel>Shared with</GroupLabel>
          <Card>
            {shares.map((s, i) => (
              <div key={s.company_id}>
                {i > 0 && <Divider />}
                <div className="flex min-h-14 items-center gap-2 pl-4">
                  <span className="flex-1 text-[17px]">{s.company_name}</span>
                  <button
                    onClick={() => confirm(`Stop sharing this job with ${s.company_name}?`) && unshare.mutate(s.company_id)}
                    className="flex h-14 items-center gap-1 px-4 text-[15px] font-semibold text-problem active:opacity-50"
                  >
                    <CloseIcon size={16} />
                    Stop
                  </button>
                </div>
              </div>
            ))}
          </Card>
          {unshare.error && <ErrorNote error={unshare.error} />}
        </section>
      )}

      <form onSubmit={submit} className="space-y-3">
        <GroupLabel>Share with a company</GroupLabel>
        <Card>
          <Field
            label="Email someone at that company logs in with"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@theircompany.com"
          />
        </Card>
        {share.error && <ErrorNote error={share.error} />}
        {sharedWith && (
          <p className="rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-dark">
            Shared with <strong>{sharedWith}</strong>. It now shows in their Jobs list.
          </p>
        )}
        <Button type="submit" disabled={share.isPending || !email.trim()}>
          {share.isPending ? 'Sharing…' : 'Share'}
        </Button>
        <p className="px-4 text-[13px] text-muted">They need to have signed up for the app first.</p>
      </form>
    </Screen>
  )
}
