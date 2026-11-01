import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AddressField } from '../components/AddressField'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, GroupLabel, Loading, TextArea } from '../components/ui'
import { backend } from '../data/backend'
import { refreshAll, useProperties, useProspects } from '../data/queries'

/** Record a turnover before it's a confirmed job: it becomes a turnover lead (walkthrough, punch list, estimate) */
export function OpportunityFormScreen() {
  const { leadId = '' } = useParams()
  const { data: leads } = useProspects()
  const { data: properties = [] } = useProperties(leadId)
  const lead = leads?.find((l) => l.id === leadId)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [address, setAddress] = useState('')
  const [unit, setUnit] = useState('')
  const [moveOut, setMoveOut] = useState('')
  const [readyBy, setReadyBy] = useState('')
  const [scope, setScope] = useState('')
  const [walkDate, setWalkDate] = useState('')
  const [walkTime, setWalkTime] = useState('')

  const save = useMutation({
    mutationFn: () =>
      backend.addOpportunity(lead!, {
        address,
        unit,
        move_out_date: moveOut || null,
        ready_by_date: readyBy || null,
        scope,
        walkthrough_at: walkDate && walkTime ? new Date(`${walkDate}T${walkTime}`).toISOString() : null,
      }),
    onSuccess: (job) => {
      void refreshAll(qc)
      navigate(`/jobs/${job.id}`, { replace: true })
    },
  })

  const back = { to: `/sales/leads/${leadId}`, label: 'Lead' }
  if (!lead) {
    return (
      <Screen title="Upcoming turnover" back={back}>
        <Loading />
      </Screen>
    )
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    save.mutate()
  }

  return (
    <Screen title="Upcoming turnover" eyebrow={lead.org?.name ?? lead.name} back={back}>
      <form onSubmit={submit} className="space-y-6">
        {properties.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {properties.map(({ property }) => (
              <button
                key={property.id}
                type="button"
                onClick={() => setAddress(property.address)}
                className={`min-h-10 rounded-full px-3 text-[14px] font-semibold ${
                  address === property.address ? 'bg-brand text-white' : 'bg-card'
                }`}
              >
                {property.address}
              </button>
            ))}
          </div>
        )}
        <Card>
          <AddressField value={address} onChange={setAddress} />
          <Divider />
          <Field label="Unit (optional)" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. 2B" />
        </Card>

        <section>
          <GroupLabel>Dates</GroupLabel>
          <Card className="grid grid-cols-2">
            <Field label="Tenant moves out" type="date" value={moveOut} onChange={(e) => setMoveOut(e.target.value)} />
            <Field
              label="Ready for move-in by"
              type="date"
              value={readyBy}
              onChange={(e) => setReadyBy(e.target.value)}
              className="border-l border-hairline"
            />
          </Card>
        </section>

        <Card>
          <TextArea
            label="Estimated scope"
            rows={3}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder="e.g. Paint 2 bedrooms, patch walls, replace blinds, deep clean"
          />
        </Card>

        <section>
          <GroupLabel>Walkthrough (optional)</GroupLabel>
          <Card className="grid grid-cols-2">
            <Field label="Date" type="date" value={walkDate} onChange={(e) => setWalkDate(e.target.value)} />
            <Field
              label="Time"
              type="time"
              value={walkTime}
              onChange={(e) => setWalkTime(e.target.value)}
              className="border-l border-hairline"
            />
          </Card>
        </section>

        {save.error && <ErrorNote error={save.error} />}
        <Button type="submit" disabled={save.isPending || !address.trim() || Boolean(walkDate) !== Boolean(walkTime)}>
          {save.isPending ? 'Saving…' : 'Save turnover'}
        </Button>
        <p className="-mt-3 px-4 text-center text-[13px] text-muted">
          It's added to Turnovers, where you book the walkthrough, build the punch list and convert it to a job.
        </p>
      </form>
    </Screen>
  )
}
