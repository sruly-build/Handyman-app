import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { CloseIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, GroupLabel, Loading } from '../components/ui'
import { backend } from '../data/backend'
import { keys, refreshAll, useInvites, usePeople } from '../data/queries'
import { useUser } from '../lib/auth'

/** People in my company, and inviting new ones */
export function TeamScreen() {
  const user = useUser()
  const isOwner = user.role === 'owner'
  const { data: people, isLoading } = usePeople()
  const { data: invites = [] } = useInvites()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const qc = useQueryClient()

  const invite = useMutation({
    mutationFn: (e: string) => backend.inviteMember(e),
    onSuccess: (_d, e) => {
      setSent(e.trim().toLowerCase())
      setEmail('')
      void qc.invalidateQueries({ queryKey: keys.invites })
    },
  })
  const cancel = useMutation({
    mutationFn: (e: string) => backend.cancelInvite(e),
    onSettled: () => refreshAll(qc),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setSent(null)
    invite.mutate(email)
  }

  return (
    <Screen title="Team" back={{ to: '/more', label: 'Me' }}>
      <GroupLabel>People in your company</GroupLabel>
      {isLoading && <Loading />}
      <Card>
        {(people ?? []).map((p, i) => (
          <div key={p.id}>
            {i > 0 && <Divider />}
            <div className="flex min-h-14 items-center gap-3 px-4 py-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[15px] font-bold text-brand-dark">
                {(p.full_name || '?').charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 text-[17px]">
                {p.full_name || 'Unnamed'}
                {p.id === user.id && <span className="text-muted"> (you)</span>}
              </span>
              <span className="text-[14px] text-muted">{p.role === 'owner' ? 'Owner' : 'Team member'}</span>
            </div>
          </div>
        ))}
      </Card>
      <p className="mt-1.5 px-4 text-[13px] text-muted">
        Everyone in your company sees all its jobs, parts and time, and clocks in separately.
      </p>

      {isOwner && (
        <>
          {invites.length > 0 && (
            <section className="mt-6">
              <GroupLabel>Approved, not signed up yet</GroupLabel>
              <Card>
                {invites.map((inv, i) => (
                  <div key={inv.email}>
                    {i > 0 && <Divider />}
                    <div className="flex min-h-14 items-center gap-2 pl-4">
                      <span className="flex-1 truncate text-[17px]">{inv.email}</span>
                      <button
                        onClick={() => confirm(`Cancel the invite for ${inv.email}?`) && cancel.mutate(inv.email)}
                        className="flex h-14 w-14 items-center justify-center text-muted active:opacity-50"
                        aria-label={`Cancel invite for ${inv.email}`}
                      >
                        <CloseIcon size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </Card>
            </section>
          )}

          <form onSubmit={submit} className="mt-6 space-y-3">
            <GroupLabel>Approve someone to join your team</GroupLabel>
            <Card>
              <Field
                label="Their email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="worker@example.com"
              />
            </Card>
            {invite.error && <ErrorNote error={invite.error} />}
            {sent && (
              <p className="rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-dark">
                Approved. Now send <strong>{sent}</strong> the app link and ask them to tap <strong>Sign up</strong> with
                that email. They choose their own password and join your company automatically.
              </p>
            )}
            <Button type="submit" variant="secondary" disabled={invite.isPending || !email.trim()}>
              {invite.isPending ? 'Saving…' : 'Approve'}
            </Button>
            <p className="px-4 text-[13px] text-muted">
              Only approved emails can sign up. The app doesn't email them: let them know by text or email.
            </p>
          </form>
        </>
      )}
    </Screen>
  )
}
