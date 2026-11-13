import { Link, useParams } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { Card, EmptyState, ErrorNote, Loading } from '../components/ui'
import { useLandlords, useLandlordSummary, useServiceSettings } from '../data/queries'
import { LandlordStatus } from '../landlord/LandlordStatus'

/** The landlords we work with (from Houses → Landlords) */
export function LandlordsScreen() {
  const { data, isLoading, error } = useLandlords()
  const { data: settings } = useServiceSettings()
  const join = settings?.public_slug ? `${window.location.origin}/l/${settings.public_slug}` : ''
  return (
    <Screen title="Landlords" back={{ to: '/houses', label: 'Houses' }}>
      {join && (
        <Card className="mb-4 px-4 py-3">
          <p className="text-[13px] font-medium text-muted">Landlord sign-up and login page</p>
          <a href={join} target="_blank" rel="noreferrer" className="break-all text-[15px] font-semibold text-brand">
            {join}
          </a>
          <p className="mt-1 text-[13px] text-muted">Landlords sign up free with an email code. They see a house only after you approve it, or once they pay for its plan.</p>
        </Card>
      )}
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {data && data.length === 0 && <EmptyState title="No landlords yet">Add one on a house, or share the sign-up page.</EmptyState>}
      {data && data.length > 0 && (
        <Card>
          {data.map((l, i) => (
            <Link key={l.id} to={`/landlords/${l.id}`} className={`block px-4 py-3 active:bg-canvas ${i ? 'border-t border-hairline' : ''}`}>
              <p className="text-[17px]">{l.name || l.email}</p>
              <p className="text-[13px] text-muted">{[l.phone, l.email, l.user_id ? 'has a login' : 'no login yet'].filter(Boolean).join(' · ')}</p>
            </Link>
          ))}
        </Card>
      )}
    </Screen>
  )
}

/** What the landlord sees, for the owner: per house and in total */
export function LandlordViewScreen() {
  const { landlordId = '' } = useParams()
  const { data: summary, isLoading, error } = useLandlordSummary(landlordId)
  return (
    <Screen title={summary?.landlord.name || summary?.landlord.email || 'Landlord'} back={{ to: '/landlords', label: 'Landlords' }}>
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {summary && (
        <>
          <p className="-mt-3 mb-4 px-1 text-[15px] text-muted">This is what {summary.landlord.name.split(/\s+/)[0] || 'they'} see{summary.landlord.name ? 's' : ''} when logged in.</p>
          {summary.houses.length ? <LandlordStatus summary={summary} houseLink={(id) => `/houses/${id}`} /> : <EmptyState title="No approved houses" />}
        </>
      )}
    </Screen>
  )
}
