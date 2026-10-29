import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AddressField } from '../components/AddressField'
import { ClientNameField } from '../components/ClientNameField'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, GroupLabel, TextArea } from '../components/ui'
import { backend } from '../data/backend'
import { refreshAll, useContacts } from '../data/queries'
import type { LeadInput } from '../data/types'
import { useUser } from '../lib/auth'

/** A new lead: just the basics. The full details come at the walkthrough. */
export function LeadFormScreen() {
  const user = useUser()
  const { data: contacts = [] } = useContacts()
  const clients = contacts.filter((c) => c.kind === 'client' && c.owner_id === user.id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [form, setForm] = useState<LeadInput>({
    customer_name: '',
    customer_phone: '',
    address: '',
    notes: '',
    client_id: null,
  })
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const set = (patch: Partial<LeadInput>) => setForm({ ...form, ...patch })
  const linked = clients.find((c) => c.id === form.client_id)

  const save = useMutation({
    mutationFn: async () => {
      const lead = await backend.createLead(form)
      if (date && time) await backend.bookWalkthrough(lead, new Date(`${date}T${time}`).toISOString())
      return lead
    },
    onSuccess: (lead) => {
      void refreshAll(qc)
      navigate(`/jobs/${lead.id}`, { replace: true })
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    save.mutate()
  }

  return (
    <Screen title="New lead" back={{ to: '/leads', label: 'Leads' }}>
      <form onSubmit={submit} className="space-y-6">
        <Card>
          <ClientNameField
            value={form.customer_name}
            clients={clients}
            linked={linked}
            autoFocus
            onType={(customer_name) =>
              set({ customer_name, client_id: linked && customer_name === linked.name ? linked.id : null })
            }
            onPick={(c) =>
              set({
                client_id: c.id,
                customer_name: c.name || c.business,
                customer_phone: c.phone || form.customer_phone,
                address: c.address || form.address,
              })
            }
          />
          <Divider />
          <Field
            label="Phone"
            type="tel"
            autoComplete="tel"
            value={form.customer_phone}
            onChange={(e) => set({ customer_phone: e.target.value })}
            placeholder="(732) 555-1234"
          />
          <Divider />
          <AddressField value={form.address} onChange={(address) => set({ address })} />
          <Divider />
          <TextArea
            label="What they need"
            rows={3}
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="e.g. Leaky faucet and two doors that stick"
          />
        </Card>

        <section>
          <GroupLabel>Walkthrough (optional, you can book it later)</GroupLabel>
          <Card className="grid grid-cols-2">
            <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Field
              label="Time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="border-l border-hairline"
            />
          </Card>
        </section>

        {save.error && <ErrorNote error={save.error} />}
        <Button
          type="submit"
          disabled={save.isPending || !form.customer_name.trim() || Boolean(date) !== Boolean(time)}
        >
          {save.isPending ? 'Saving…' : 'Save lead'}
        </Button>
        {Boolean(date) !== Boolean(time) && (
          <p className="-mt-3 px-4 text-[13px] text-muted">To book the walkthrough, pick both a date and a time.</p>
        )}
      </form>
    </Screen>
  )
}
