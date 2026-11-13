import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backend } from '../data/backend'
import { startResults } from '../data/inspections'
import { refreshAll, useCompany, useReminders, useServiceSettings } from '../data/queries'
import type { Landlord } from '../data/types'
import { todayISO } from '../lib/dates'
import { ReadyTextSheet } from './ReadyText'
import { Card, GroupLabel } from './ui'

const label = { filter: 'HVAC filter', winter: 'Before-winter check-up', spring: 'Before-spring check-up' }

/** Coming up at plan houses: filters due and seasonal check-ups (top of the Requests inbox) */
export function Reminders() {
  const { data = [] } = useReminders()
  const { data: settings } = useServiceSettings()
  const { data: company } = useCompany()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [texting, setTexting] = useState<{ landlord: Landlord; text: string } | null>(null)
  const run = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: () => void refreshAll(qc) })
  if (!data.length) return null
  const sign = company?.name ? ` – ${company.name}` : ''
  return (
    <section className="mt-5">
      <GroupLabel>Coming up</GroupLabel>
      <Card>
        {data.map((r, i) => {
          const street = r.address.split(',')[0]
          const hi = `Hi${r.landlord?.name ? ` ${r.landlord.name.split(/\s+/)[0]}` : ''}, `
          const text =
            r.kind === 'filter'
              ? `${hi}the HVAC filter at ${street} is due${r.overdue ? '' : ` on ${new Date(`${r.due}T12:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`}. We'll change it at the next visit, or reply with a good day to stop by.${sign}`
              : `${hi}it's time for the ${r.kind === 'winter' ? 'before-winter' : 'before-spring'} check-up at ${street}. Reply with a good day and time for us to come by.${sign}`
          return (
            <div key={`${r.houseId}-${r.kind}`} className={`px-4 py-3 ${i ? 'border-t border-hairline' : ''}`}>
              <p className="text-[17px] font-semibold">{street}</p>
              <p className={`text-[15px] ${r.overdue ? 'font-semibold text-problem' : 'text-muted'}`}>
                {label[r.kind]}
                {r.kind === 'filter' ? ` ${r.overdue ? 'overdue since' : 'due'} ${new Date(`${r.due}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {r.kind === 'filter' ? (
                  <button className="min-h-10 rounded-xl bg-brand-soft px-3 text-[15px] font-semibold text-brand-dark" onClick={() => run.mutate(() => backend.updateHouse(r.houseId, { last_filter_at: todayISO() }))}>
                    Changed today
                  </button>
                ) : (
                  <button
                    className="min-h-10 rounded-xl bg-brand-soft px-3 text-[15px] font-semibold text-brand-dark"
                    onClick={() =>
                      run.mutate(async () => {
                        const ins = await backend.saveInspection({ property_id: r.houseId, kind: r.kind as 'winter' | 'spring', results: startResults(r.kind as 'winter', settings), shared: true })
                        navigate(`/houses/${r.houseId}/inspections/${ins.id}`)
                      })
                    }
                  >
                    Start check-up
                  </button>
                )}
                {r.landlord?.phone && (
                  <button className="min-h-10 rounded-xl bg-canvas px-3 text-[15px] font-semibold text-brand" onClick={() => setTexting({ landlord: r.landlord!, text })}>
                    Text the landlord
                  </button>
                )}
                <button className="min-h-10 rounded-xl bg-canvas px-3 text-[15px] font-semibold text-brand" onClick={() => navigate(`/houses/${r.houseId}`)}>
                  House
                </button>
              </div>
            </div>
          )
        })}
      </Card>
      {texting && (
        <ReadyTextSheet phone={texting.landlord.phone} title={`Message ${texting.landlord.name.split(/\s+/)[0] || 'the landlord'}`} choices={[{ label: 'Reminder', text: texting.text }]} onClose={() => setTexting(null)} />
      )}
    </section>
  )
}
