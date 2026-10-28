import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { CloseIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, EmptyState, ErrorNote, Field, GroupLabel, Loading } from '../components/ui'
import { backend } from '../data/backend'
import { refreshAll, useApprovals } from '../data/queries'
import { useUser } from '../lib/auth'

/** The app's admin approves who may sign up and start a new company */
export function ApprovalsScreen() {
  const user = useUser()
  const { data: approvals, isLoading } = useApprovals()
  const [email, setEmail] = useState('')
  const [approved, setApproved] = useState<string | null>(null)
  const qc = useQueryClient()

  const approve = useMutation({
    mutationFn: (e: string) => backend.approveSignup(e),
    onSuccess: (_d, e) => {
      setApproved(e.trim().toLowerCase())
      setEmail('')
      void refreshAll(qc)
    },
  })
  const cancel = useMutation({
    mutationFn: (e: string) => backend.cancelInvite(e),
    onSettled: () => refreshAll(qc),
  })

  if (!user.isAdmin) {
    return (
      <Screen title="Approve sign-ups" back={{ to: '/more', label: 'Me' }}>
        <EmptyState title="Only the app's admin can approve sign-ups" />
      </Screen>
    )
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setApproved(null)
    approve.mutate(email)
  }

  return (
    <Screen title="Approve sign-ups" back={{ to: '/more', label: 'Me' }}>
      <div className="mb-5 rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-dark">
        Nobody can sign up unless their email is approved. Approve someone here to let them create their own company
        and choose their own password. To add a worker to <em>your</em> company, use <strong>Me → Team</strong> instead.
      </div>

      <form onSubmit={submit} className="space-y-3">
        <GroupLabel>Approve a new company</GroupLabel>
        <Card>
          <Field
            label="Their email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@theircompany.com"
          />
        </Card>
        {approve.error && <ErrorNote error={approve.error} />}
        {approved && (
          <p className="rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-dark">
            Approved. Send <strong>{approved}</strong> the app link and ask them to tap <strong>Sign up</strong> with that
            email.
          </p>
        )}
        <Button type="submit" disabled={approve.isPending || !email.trim()}>
          {approve.isPending ? 'Approving…' : 'Approve'}
        </Button>
      </form>

      <section className="mt-6">
        <GroupLabel>Approved, not signed up yet</GroupLabel>
        {isLoading && <Loading />}
        {approvals && approvals.length === 0 && <EmptyState title="No one waiting" />}
        {approvals && approvals.length > 0 && (
          <Card>
            {approvals.map((a, i) => (
              <div key={a.email}>
                {i > 0 && <Divider />}
                <div className="flex min-h-14 items-center gap-2 pl-4">
                  <span className="flex-1 truncate text-[17px]">{a.email}</span>
                  <button
                    onClick={() => confirm(`Take back the approval for ${a.email}?`) && cancel.mutate(a.email)}
                    className="flex h-14 w-14 items-center justify-center text-muted active:opacity-50"
                    aria-label={`Cancel approval for ${a.email}`}
                  >
                    <CloseIcon size={18} />
                  </button>
                </div>
              </div>
            ))}
          </Card>
        )}
        {cancel.error && <ErrorNote error={cancel.error} />}
      </section>
    </Screen>
  )
}
