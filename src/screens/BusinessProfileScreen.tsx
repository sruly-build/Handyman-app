import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, Loading } from '../components/ui'
import { backend } from '../data/backend'
import { refreshAll, useCompany } from '../data/queries'
import type { Company } from '../data/types'
import { useUser } from '../lib/auth'

type Form = Omit<Company, 'id'>

/** The company's name and contact details, printed on its estimates, invoices and reports */
export function BusinessProfileScreen() {
  const { data, isLoading, error } = useCompany()
  const canEdit = useUser().role === 'owner'
  const [form, setForm] = useState<Form | null>(null)
  const navigate = useNavigate()
  const qc = useQueryClient()

  useEffect(() => {
    if (data && !form) {
      const { id: _id, ...rest } = data
      setForm(rest)
    }
  }, [data, form])

  const save = useMutation({
    mutationFn: (f: Form) => backend.saveCompany({ ...f, name: f.name.trim() }),
    onSuccess: () => {
      void refreshAll(qc)
      navigate(-1)
    },
  })

  const back = { to: '/more', label: 'Me' }
  if (isLoading || error || !form) {
    return (
      <Screen title="Business profile" back={back}>
        {error ? <ErrorNote error={error} /> : <Loading />}
      </Screen>
    )
  }

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch })

  function submit(e: FormEvent) {
    e.preventDefault()
    save.mutate(form!)
  }

  return (
    <Screen title="Business profile" back={back}>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={!canEdit}>
          <Card>
            <Field
              label="Business name"
              required
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="e.g. Dave's Handyman Service"
            />
            <Divider />
            <Field
              label="Email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
            />
            <Divider />
            <Field label="Phone" type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            <Divider />
            <Field
              label="Address"
              autoComplete="street-address"
              value={form.address}
              onChange={(e) => set({ address: e.target.value })}
            />
          </Card>
        </fieldset>
        <p className="px-4 text-[13px] text-muted">
          Printed at the top of your estimates, invoices and before-and-after reports.
          {canEdit ? '' : ' Only the company owner can change it.'}
        </p>
        {save.error && <ErrorNote error={save.error} />}
        {canEdit && (
          <Button type="submit" disabled={save.isPending || !form.name.trim()}>
            {save.isPending ? 'Saving…' : 'Save business profile'}
          </Button>
        )}
      </form>
    </Screen>
  )
}
