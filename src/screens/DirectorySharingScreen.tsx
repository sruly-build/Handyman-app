import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, GroupLabel, Loading } from '../components/ui'
import { backend } from '../data/backend'
import { refreshAll, useDirectoryShares, useSharedDirectories } from '../data/queries'

/** Who may see my directory (nobody unless I add them), and whose directories I can see */
export function DirectorySharingScreen() {
  const { data: shares, isLoading } = useDirectoryShares()
  const { data: sharedWithMe = [] } = useSharedDirectories()
  const [email, setEmail] = useState('')
  const [added, setAdded] = useState<string | null>(null)
  const qc = useQueryClient()

  const share = useMutation({
    mutationFn: (e: string) => backend.shareDirectory(e),
    onSuccess: (name) => {
      setAdded(name)
      setEmail('')
      void refreshAll(qc)
    },
  })
  const unshare = useMutation({
    mutationFn: (id: string) => backend.unshareDirectory(id),
    onSettled: () => refreshAll(qc),
  })
  const leave = useMutation({
    mutationFn: (id: string) => backend.leaveDirectory(id),
    onSettled: () => refreshAll(qc),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setAdded(null)
    share.mutate(email)
  }

  return (
    <Screen title="Directory sharing" back={{ to: '/more', label: 'Me' }}>
      <p className="mb-5 px-1 text-[15px] text-muted">
        Your directory is private: nobody else sees it, not even your own team, unless you add them here. People you
        add can look up and call your contacts, but can't change them.
      </p>

      {isLoading && <Loading />}
      {shares && shares.length > 0 && (
        <section className="mb-6">
          <GroupLabel>Can see your directory</GroupLabel>
          <Card>
            {shares.map((p, i) => (
              <div key={p.id}>
                {i > 0 && <Divider />}
                <div className="flex min-h-14 items-center gap-2 pl-4">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[17px]">{p.name}</span>
                    {p.email && p.email !== p.name && <span className="block truncate text-[13px] text-muted">{p.email}</span>}
                  </span>
                  <button
                    onClick={() => confirm(`Stop sharing your directory with ${p.name}?`) && unshare.mutate(p.id)}
                    className="flex h-14 items-center px-4 text-[15px] font-semibold text-problem active:opacity-50"
                  >
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
        <GroupLabel>Share your directory with someone</GroupLabel>
        <Card>
          <Field
            label="Email they log in with"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </Card>
        {share.error && <ErrorNote error={share.error} />}
        {added && (
          <p className="rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-dark">
            <strong>{added}</strong> can now see your directory.
          </p>
        )}
        <Button type="submit" variant="secondary" disabled={share.isPending || !email.trim()}>
          {share.isPending ? 'Sharing…' : 'Share my directory'}
        </Button>
      </form>

      {sharedWithMe.length > 0 && (
        <section className="mt-8">
          <GroupLabel>Shared with you</GroupLabel>
          <Card>
            {sharedWithMe.map((p, i) => (
              <div key={p.id}>
                {i > 0 && <Divider />}
                <div className="flex min-h-14 items-center gap-2 pl-4">
                  <span className="flex-1 text-[17px]">{p.name}'s directory</span>
                  <button
                    onClick={() => confirm(`Remove ${p.name}'s contacts from your directory?`) && leave.mutate(p.id)}
                    className="flex h-14 items-center px-4 text-[15px] font-semibold text-problem active:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </Card>
          {leave.error && <ErrorNote error={leave.error} />}
        </section>
      )}
    </Screen>
  )
}
