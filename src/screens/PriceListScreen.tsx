import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { TrashIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, EmptyState, ErrorNote, Field, GroupLabel, Loading } from '../components/ui'
import { backend } from '../data/backend'
import { formatMoney } from '../data/billing'
import { refreshAll, usePriceList } from '../data/queries'
import { useUser } from '../lib/auth'

/** Things the company charges a set price for, picked from on the Billing screen */
export function PriceListScreen() {
  const user = useUser()
  const canEdit = user.role === 'owner'
  const { data: list, isLoading, error } = usePriceList()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')

  const add = useMutation({
    mutationFn: () => backend.addPriceItem(name.trim(), parseFloat(price)),
    onSuccess: () => {
      setName('')
      setPrice('')
    },
    onSettled: () => refreshAll(qc),
  })
  const remove = useMutation({
    mutationFn: (id: string) => backend.deletePriceItem(id),
    onSettled: () => refreshAll(qc),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    add.mutate()
  }

  return (
    <Screen title="Price list" back={{ to: '/settings', label: 'Prices' }}>
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {list && list.length === 0 && (
        <EmptyState title="No set prices yet">
          Add things you charge a set price for, like "Install ceiling fan" or "Trip fee". Then add them to any bill in one tap.
        </EmptyState>
      )}
      {list && list.length > 0 && (
        <Card>
          {list.map((p, i) => (
            <div key={p.id}>
              {i > 0 && <Divider />}
              <div className={`flex min-h-14 items-center gap-2 pl-4 ${canEdit ? '' : 'pr-4'}`}>
                <span className="min-w-0 flex-1 truncate text-[17px]">{p.name}</span>
                <span className="text-[16px] font-semibold">{formatMoney(p.price)}</span>
                {canEdit && (
                  <button
                    onClick={() => confirm(`Remove "${p.name}" from the price list?`) && remove.mutate(p.id)}
                    className="flex h-12 w-12 shrink-0 items-center justify-center text-muted active:opacity-50"
                    aria-label={`Remove ${p.name}`}
                  >
                    <TrashIcon size={18} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
      {remove.error && <ErrorNote error={remove.error} />}

      {canEdit ? (
        <form onSubmit={submit} className="mt-6 space-y-3">
          <GroupLabel>Add a set price</GroupLabel>
          <Card>
            <Field label="What" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Install ceiling fan" />
            <Divider />
            <Field
              label="Price $"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="0.00"
            />
          </Card>
          {add.error && <ErrorNote error={add.error} />}
          <Button type="submit" disabled={add.isPending || !name.trim() || !(parseFloat(price) >= 0) || price === ''}>
            {add.isPending ? 'Adding…' : 'Add to price list'}
          </Button>
        </form>
      ) : (
        <p className="mt-4 rounded-2xl bg-progress-soft px-4 py-3 text-[14px] text-[#9a5300]">
          Only the company owner can change the price list.
        </p>
      )}
    </Screen>
  )
}
