import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { CloseIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, EmptyState, ErrorNote, Field, GroupLabel, Loading } from '../components/ui'
import { backend } from '../data/backend'
import { refreshAll, useApprovals, useCompanies } from '../data/queries'
import { useUser } from '../lib/auth'

const NEW_COMPANY = ''

/** The app's admin is the only one who approves who may sign up, for any company */
export function ApprovalsScreen() {
  const user = useUser()
  const { data: approvals, isLoading } = useApprovals()
  const { data: companies = [] } = useCompanies()
  const [email, setEmail] = useState('')
  const [destination, setDestination] = useState(NEW_COMPANY)
  const [approved, setApproved] = useState<{ email: string; where: string } | null>(null)
  const qc = useQueryClient()

  const companyName = (id: string | null) =>
    id === null ? null : (companies.find((c) => c.id === id)?.name || 'A company')

  const approve = useMutation({
    mutationFn: ({ email: e, companyId }: { email: string; companyId: string | null }) => backend.approveSignup(e, companyId),
    onSuccess: (_d, { email: e, companyId }) => {
      setApproved({
        email: e.trim().toLowerCase(),
        where: companyId ? `join ${companyName(companyId)}` : 'start their own company',
      })
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
    approve.mutate({ email, companyId: destination === NEW_COMPANY ? null : destination })
  }

  return (
    <Screen title="Approve sign-ups" back={{ to: '/more', label: 'Me' }}>
      <div className="mb-5 rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-dark">
        Only you can let people into the app. Approve an email, choose whether they start a new company or join an
        existing one, then tell them to sign up. They choose their own password.
      </div>

      <form onSubmit={submit} className="space-y-3">
        <GroupLabel>Approve someone</GroupLabel>
        <Card>
          <Field
            label="Their email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
          <Divider />
          <label className="block px-4 py-2.5">
            <span className="block text-[13px] font-medium text-muted">They will</span>
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="min-h-10 w-full bg-transparent outline-none"
              aria-label="Where they go"
            >
              <option value={NEW_COMPANY}>Start a new company (as its owner)</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  Join {c.name || 'Unnamed company'} (as a team member)
                </option>
              ))}
            </select>
          </label>
        </Card>
        {approve.error && <ErrorNote error={approve.error} />}
        {approved && (
          <p className="rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-dark">
            Approved <strong>{approved.email}</strong> to {approved.where}. Send them the app link and ask them to tap{' '}
            <strong>Sign up</strong> with that email.
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
                <div className="flex min-h-14 items-center gap-2 py-2 pl-4">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[17px]">{a.email}</span>
                    <span className="block truncate text-[13px] text-muted">
                      {a.company_id ? `Joins ${companyName(a.company_id)}` : 'Starts a new company'}
                    </span>
                  </span>
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
