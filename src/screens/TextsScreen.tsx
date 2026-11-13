import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { Card, EmptyState, ErrorNote, Loading } from '../components/ui'
import { backend } from '../data/backend'
import { refreshAll, useTexts } from '../data/queries'

/** Every text forwarded from Google Voice: which became requests, and which were skipped (and why) */
export function TextsScreen() {
  const { data, isLoading, error } = useTexts()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const make = useMutation({
    mutationFn: backend.textToRequest,
    onSuccess: (r) => {
      void refreshAll(qc)
      navigate(`/requests/${r.id}`)
    },
  })
  return (
    <Screen title="Texts" back={{ to: '/requests', label: 'Requests' }}>
      <p className="-mt-3 mb-4 px-1 text-[15px] text-muted">
        Texts to your Google Voice number, forwarded by email. Repair requests go to the inbox; short replies like “thanks” or “running late” are skipped.
        Replies are never sent automatically.
      </p>
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {make.error && <ErrorNote error={make.error} />}
      {data && data.length === 0 && <EmptyState title="No texts yet">Set up Google Voice forwarding (see the setup steps) and texts show up here.</EmptyState>}
      {data && data.length > 0 && (
        <Card>
          {data.map((m, i) => (
            <div key={m.id} className={`px-4 py-3 ${i ? 'border-t border-hairline' : ''}`}>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-[15px] font-semibold">{m.from_phone || 'Unknown number'}</p>
                <span className="text-[13px] text-muted">{new Date(m.received_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
              </div>
              <p className="whitespace-pre-wrap text-[15px]" dir="auto">
                {m.body || '(photo only)'}
              </p>
              {m.photo_count > 0 && <p className="text-[13px] text-muted">{m.photo_count} photo{m.photo_count === 1 ? '' : 's'}</p>}
              <p className="mt-1 text-[13px] text-muted">{m.reason}</p>
              {m.verdict === 'request' && m.request_id ? (
                <Link to={`/requests/${m.request_id}`} className="mt-1 inline-block text-[15px] font-semibold text-brand">
                  Open the request
                </Link>
              ) : (
                <button className="mt-1 text-[15px] font-semibold text-brand" disabled={make.isPending} onClick={() => make.mutate(m)}>
                  Make it a request
                </button>
              )}
            </div>
          ))}
        </Card>
      )}
    </Screen>
  )
}
