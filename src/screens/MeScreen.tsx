import { useState, type FormEvent } from 'react'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, SectionTitle } from '../components/ui'
import { backend } from '../data/backend'
import { useUser } from '../lib/auth'

export function MeScreen() {
  const user = useUser()
  const [name, setName] = useState(user.name)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<unknown>(null)

  async function saveName(e: FormEvent) {
    e.preventDefault()
    setStatus('saving')
    setError(null)
    try {
      await backend.updateMyName(name.trim())
      setStatus('saved')
    } catch (err) {
      setError(err)
      setStatus('idle')
    }
  }

  return (
    <Screen title="Me">
      <form onSubmit={saveName} className="space-y-3">
        <Card>
          <Field
            label="Your name (used in greetings and on time sheets)"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setStatus('idle')
            }}
          />
          <Divider />
          <div className="px-4 py-3">
            <p className="text-[13px] font-medium text-muted">Logged in as</p>
            <p className="text-[17px]">{user.email}</p>
          </div>
        </Card>
        {Boolean(error) && <ErrorNote error={error} />}
        <Button type="submit" variant="secondary" disabled={!name.trim() || name.trim() === user.name || status === 'saving'}>
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Save name'}
        </Button>
      </form>

      <SectionTitle>App</SectionTitle>
      <Card>
        <div className="px-4 py-3">
          <p className="text-[13px] font-medium text-muted">Data is stored in</p>
          <p className="text-[17px]">
            {backend.mode === 'supabase' ? 'Supabase (shared with your team)' : 'This device only (Demo mode)'}
          </p>
        </div>
      </Card>

      <div className="mt-8">
        <Button variant="danger" onClick={() => void backend.signOut()}>
          Log out
        </Button>
      </div>
    </Screen>
  )
}
