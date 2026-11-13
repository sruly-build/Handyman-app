import { useEffect, useState } from 'react'
import { backend } from '../data/backend'
import { alertsOn, pushSupported, turnAlertsOff, turnAlertsOn } from '../lib/push'
import { Card, Divider, ErrorNote, Toggle } from './ui'

/** Me → Emergency alerts: a loud alert on this phone when an emergency request comes in */
export function EmergencyAlerts() {
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [note, setNote] = useState('')
  useEffect(() => {
    void alertsOn().then(setOn).catch(() => setOn(false))
  }, [])

  async function toggle(want: boolean) {
    setBusy(true)
    setError(null)
    setNote('')
    try {
      if (want) await turnAlertsOn()
      else await turnAlertsOff()
      setOn(want)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  async function test() {
    setError(null)
    setNote('')
    try {
      const { sent } = await backend.sendTestAlert()
      setNote(sent ? 'Test alert sent. It should pop up in a few seconds.' : 'No phones got it. Turn alerts off and on again.')
    } catch (e) {
      setError(e)
    }
  }

  return (
    <>
      <Card>
        <Toggle
          label="Emergency alerts on this phone"
          hint={pushSupported() ? 'A loud alert when someone sends an emergency request' : "This browser can't get alerts"}
          checked={on}
          onChange={(v) => !busy && pushSupported() && void toggle(v)}
        />
        {on && (
          <>
            <Divider />
            <button onClick={() => void test()} className="min-h-12 w-full px-4 text-left text-[17px] text-brand">
              Send a test alert
            </button>
          </>
        )}
      </Card>
      <p className="mt-1.5 px-4 text-[13px] text-muted">
        On Android: open the app in Chrome, tap ⋮ → Add to Home screen (or Install app), then turn this on from the home-screen app.
      </p>
      {note && <p className="mt-1.5 px-4 text-[15px] text-brand-dark">{note}</p>}
      {Boolean(error) && (
        <div className="mt-2">
          <ErrorNote error={error} />
        </div>
      )}
    </>
  )
}
