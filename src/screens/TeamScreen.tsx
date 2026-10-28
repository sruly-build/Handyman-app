import { Screen } from '../components/Screen'
import { Card, Divider, GroupLabel, Loading } from '../components/ui'
import { usePeople } from '../data/queries'
import { useUser } from '../lib/auth'

/** The people in my company */
export function TeamScreen() {
  const user = useUser()
  const { data: people, isLoading } = usePeople()

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
      <p className="mt-4 rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-dark">
        {user.isAdmin
          ? 'To add someone to this team, approve their email in Me → Approve sign-ups and choose this company.'
          : "To add someone to your team, ask the app's admin to approve their email for your company. They then sign up with that email and choose their own password."}
      </p>
    </Screen>
  )
}
