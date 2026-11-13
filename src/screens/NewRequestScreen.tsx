import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AddressField } from '../components/AddressField'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, GroupLabel, Segmented, TextArea } from '../components/ui'
import { backend } from '../data/backend'
import { refreshAll } from '../data/queries'
import type { Urgency } from '../data/types'
import { quickPicks } from '../lib/i18n'

/** Type in a request yourself (e.g. someone called) */
export function NewRequestScreen() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [address, setAddress] = useState('')
  const [unit, setUnit] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [keys, setKeys] = useState<string[]>([])
  const [other, setOther] = useState('')
  const [description, setDescription] = useState('')
  const [urgency, setUrgency] = useState<Urgency>('soon')

  const save = useMutation({
    mutationFn: () =>
      backend.addRequest({
        address, unit_label: unit, requester_name: name, requester_phone: phone, description, urgency,
        issues: keys.map((k) => ({
          key: k,
          label: k === 'other' ? '' : (quickPicks.find((q) => q.key === k)?.en ?? k),
          text: k === 'other' ? other.trim() : '',
          tried: [],
        })),
      }),
    onSuccess: (r) => {
      void refreshAll(qc)
      navigate(`/requests/${r.id}`, { replace: true })
    },
  })
  const chip = (active: boolean) =>
    `min-h-10 rounded-full px-3 text-[14px] font-semibold ${active ? 'bg-brand text-white' : 'bg-canvas text-ink active:opacity-60'}`

  return (
    <Screen title="New request" back={{ to: '/requests', label: 'Requests' }}>
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Card>
          <AddressField value={address} onChange={setAddress} />
          <Divider />
          <Field label="Apartment or unit (optional)" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </Card>
        <Card>
          <Field label="Who asked" value={name} onChange={(e) => setName(e.target.value)} />
          <Divider />
          <Field label="Their phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Card>
        <section>
          <GroupLabel>What needs fixing</GroupLabel>
          <Card className="p-3">
            <div className="flex flex-wrap gap-2">
              {quickPicks.map((q) => (
                <button
                  key={q.key}
                  type="button"
                  className={chip(keys.includes(q.key))}
                  onClick={() => setKeys((l) => (l.includes(q.key) ? l.filter((k) => k !== q.key) : [...l, q.key]))}
                >
                  {q.en}
                </button>
              ))}
            </div>
            {keys.includes('other') && (
              <div className="mt-2 rounded-xl bg-canvas">
                <Field label="The other issue" value={other} onChange={(e) => setOther(e.target.value)} />
              </div>
            )}
          </Card>
        </section>
        <Card>
          <TextArea label="Details" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Card>
        <Segmented<Urgency>
          label="Urgency"
          value={urgency}
          onChange={setUrgency}
          options={[
            { value: 'emergency', label: 'Emergency' },
            { value: 'soon', label: 'Soon' },
            { value: 'whenever', label: 'Whenever' },
          ]}
        />
        {save.error && <ErrorNote error={save.error} />}
        <Button type="submit" disabled={save.isPending || (!keys.length && !description.trim())}>
          {save.isPending ? 'Saving…' : 'Add request'}
        </Button>
      </form>
    </Screen>
  )
}
