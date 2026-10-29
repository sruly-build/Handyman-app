import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { backend } from '../data/backend'
import { formatMoney, withMarkup } from '../data/billing'
import { refreshAll, useContacts, useSettings } from '../data/queries'
import type { AssignmentInput, ItemAssignment, MaterialsBy, PunchItem, VendorPaidBy } from '../data/types'
import { useUser } from '../lib/auth'
import { CloseIcon } from './Icons'
import { Button, Card, Divider, ErrorNote, Field, Segmented, Toggle } from './ui'

const NEW = '__new__'

/** Pop-up for choosing who does a punch list item, and how they're paid */
export function AssignSheet({
  item,
  assignment,
  onClose,
}: {
  item: Pick<PunchItem, 'id' | 'job_id' | 'title'>
  assignment: ItemAssignment | undefined
  onClose: () => void
}) {
  const user = useUser()
  const { data: contacts = [] } = useContacts()
  const { data: settings } = useSettings()
  const vendors = contacts.filter((c) => c.kind === 'vendor' && c.owner_id === user.id)
  const qc = useQueryClient()

  const [who, setWho] = useState(assignment?.contact_id ?? (assignment ? NEW : ''))
  const [newName, setNewName] = useState(assignment && !assignment.contact_id ? assignment.name : '')
  const [newPhone, setNewPhone] = useState('')
  const [price, setPrice] = useState(assignment?.price != null ? String(assignment.price) : '')
  const [materialsBy, setMaterialsBy] = useState<MaterialsBy>(assignment?.materials_by ?? 'me')
  const [paidBy, setPaidBy] = useState<VendorPaidBy>(assignment?.paid_by ?? 'me')
  const [markup, setMarkup] = useState(assignment?.markup ?? false)
  const [vendorPaid, setVendorPaid] = useState(assignment?.vendor_paid ?? false)

  const chosen = vendors.find((v) => v.id === who)
  // Someone typed in before (no longer in the directory): keep them as they were
  const keptName = assignment && !assignment.contact_id && who === NEW ? assignment.name : ''
  const name = chosen ? chosen.name || chosen.business : newName.trim() || keptName
  const priceNumber = parseFloat(price)
  const pct = settings?.markup_percent ?? 20

  const save = useMutation({
    mutationFn: () => {
      const input: AssignmentInput = {
        contact_id: chosen?.id ?? null,
        name,
        price: Number.isFinite(priceNumber) ? priceNumber : null,
        materials_by: materialsBy,
        paid_by: paidBy,
        markup: paidBy === 'me' && markup,
        vendor_paid: vendorPaid,
      }
      // A new person goes into my vendors
      const addNew = who === NEW && newName.trim() && !(assignment && !assignment.contact_id)
      return backend.assignItem(item, input, addNew ? { phone: newPhone } : undefined)
    },
    onSuccess: onClose,
    onSettled: () => refreshAll(qc),
  })
  const remove = useMutation({
    mutationFn: () => backend.unassignItem(item.id),
    onSuccess: onClose,
    onSettled: () => refreshAll(qc),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    save.mutate()
  }

  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <form
        role="dialog"
        aria-label="Who is doing this item"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up mx-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-canvas px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4"
      >
        <div className="mb-3 flex items-start">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">Who is doing it</p>
            <h2 className="truncate text-[20px] font-bold">{item.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center text-muted"
            aria-label="Close"
          >
            <CloseIcon size={22} />
          </button>
        </div>

        <Card>
          <label className="block px-4 py-2.5">
            <span className="block text-[13px] font-medium text-muted">Person</span>
            <select
              value={who}
              onChange={(e) => setWho(e.target.value)}
              className="min-h-10 w-full bg-transparent text-[17px] outline-none"
              aria-label="Person"
            >
              <option value="">Choose…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name || v.business}
                  {v.categories.length ? ` (${v.categories.join(', ')})` : ''}
                </option>
              ))}
              <option value={NEW}>{keptName ? keptName : '+ Someone new'}</option>
            </select>
          </label>
          {who === NEW && !keptName && (
            <>
              <Divider />
              <Field label="Their name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              <Divider />
              <Field
                label="Phone (optional)"
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
            </>
          )}
          <Divider />
          <Field
            label="Their price for the labour $"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="0.00"
          />
        </Card>
        {who === NEW && !keptName && (
          <p className="mt-1.5 px-4 text-[13px] text-muted">They'll be added to your Vendors.</p>
        )}

        <p className="mb-1.5 mt-4 px-4 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Who buys the materials
        </p>
        <Segmented
          label="Who buys the materials"
          value={materialsBy}
          onChange={setMaterialsBy}
          options={[
            { value: 'me', label: 'Me' },
            { value: 'vendor', label: name || 'The vendor' },
          ]}
        />

        <p className="mb-1.5 mt-4 px-4 text-[13px] font-semibold uppercase tracking-wide text-muted">Who pays them</p>
        <Segmented
          label="Who pays them"
          value={paidBy}
          onChange={setPaidBy}
          options={[
            { value: 'me', label: 'Me' },
            { value: 'client', label: 'The client directly' },
          ]}
        />

        <Card className="mt-3">
          {paidBy === 'me' ? (
            <>
              <Toggle
                label={`Add my ${pct}% markup`}
                hint={
                  Number.isFinite(priceNumber)
                    ? `Client's invoice: ${formatMoney(markup ? withMarkup(priceNumber, pct) : priceNumber)}`
                    : 'Goes on the client’s invoice in place of my hourly labour'
                }
                checked={markup}
                onChange={setMarkup}
              />
              <Divider />
              <Toggle label="I've paid them" checked={vendorPaid} onChange={setVendorPaid} />
            </>
          ) : (
            <p className="px-4 py-3 text-[15px] text-muted">
              Not on your invoice. It stays on the job so you can track it.
            </p>
          )}
        </Card>
        <p className="mt-1.5 px-4 text-[13px] text-muted">
          Their price is private: it never shows on the client's invoice.
        </p>

        {(save.error || remove.error) && <ErrorNote error={save.error || remove.error} />}
        <div className="mt-4 space-y-2">
          <Button type="submit" disabled={save.isPending || !name}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
          {assignment && (
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
              className="min-h-11 w-full text-[15px] font-semibold text-problem active:opacity-50"
            >
              I'm doing it myself
            </button>
          )}
        </div>
      </form>
    </div>,
    document.body,
  )
}
