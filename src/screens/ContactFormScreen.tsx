import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AddressField } from '../components/AddressField'
import { ClientHistory } from '../components/ClientHistory'
import { CloseIcon, MailIcon, MessageIcon, PhoneIcon, PlusIcon, WhatsAppIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, GroupLabel, Loading, TextArea } from '../components/ui'
import { backend } from '../data/backend'
import { addCategory, categoriesInUse, commonCategories } from '../data/directory'
import { refreshAll, useContacts, useSharedDirectories } from '../data/queries'
import type { ContactInput } from '../data/types'
import { useUser } from '../lib/auth'
import { phoneLink, textLink, whatsappLink } from '../lib/links'

const empty: ContactInput = {
  kind: 'vendor',
  name: '',
  business: '',
  categories: [],
  phone: '',
  email: '',
  notes: '',
  address: '',
}

/** Add a client or vendor (/directory/new?kind=client) or open one (/directory/:contactId) */
export function ContactFormScreen() {
  const { contactId } = useParams()
  const [params] = useSearchParams()
  const editing = Boolean(contactId)
  const user = useUser()
  const { data: contacts, isLoading, error } = useContacts()
  const { data: sharedWithMe = [] } = useSharedDirectories()
  const contact = contacts?.find((c) => c.id === contactId)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [form, setForm] = useState<ContactInput | null>(
    editing ? null : { ...empty, kind: params.get('kind') === 'client' ? 'client' : 'vendor' },
  )
  const [newCategory, setNewCategory] = useState('')

  useEffect(() => {
    if (contact && !form) {
      const { kind, name, business, categories, phone, email, notes, address } = contact
      setForm({ kind, name, business, categories, phone, email, notes, address })
    }
  }, [contact, form])

  const save = useMutation({
    mutationFn: (f: ContactInput) =>
      backend.saveContact(
        {
          ...f,
          name: f.name.trim(),
          business: f.business.trim(),
          phone: f.phone.trim(),
          email: f.email.trim(),
          notes: f.notes.trim(),
          address: f.address.trim(),
          // A category typed but not added yet still counts
          categories: addCategory(f.categories, newCategory),
        },
        contactId,
      ),
    onSuccess: () => {
      void refreshAll(qc)
      navigate(-1)
    },
  })
  const remove = useMutation({
    mutationFn: () => backend.deleteContact(contactId!),
    onSuccess: () => {
      void refreshAll(qc)
      navigate(-1)
    },
  })

  const back = {
    to: (contact?.kind ?? form?.kind) === 'client' ? '/directory?show=clients' : '/directory',
    label: (contact?.kind ?? form?.kind) === 'client' ? 'Clients' : 'Vendors',
  }
  if (editing && (isLoading || error || !contact || !form)) {
    return (
      <Screen title="Contact" back={back}>
        {error ? (
          <ErrorNote error={error} />
        ) : contacts && !contact ? (
          <p className="px-4">This contact was deleted.</p>
        ) : (
          <Loading />
        )}
      </Screen>
    )
  }
  if (!form) return null

  // Someone else's directory, shared with me: look only
  const readOnly = Boolean(contact && contact.owner_id !== user.id)
  const set = (patch: Partial<ContactInput>) => setForm({ ...form, ...patch })
  const suggestions = [...categoriesInUse(contacts ?? []), ...commonCategories].filter(
    (c, i, all) =>
      !form.categories.some((x) => x.toLowerCase() === c.toLowerCase()) &&
      all.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === i,
  )

  const client = form.kind === 'client'

  function submit(e: FormEvent) {
    e.preventDefault()
    save.mutate(form!)
  }

  const actions = form.phone || form.email
  const actionClass =
    'flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl bg-card text-[14px] font-semibold text-brand active:bg-brand-soft'

  return (
    <Screen
      title={readOnly || editing ? form.name || form.business || 'Contact' : client ? 'New client' : 'New vendor'}
      eyebrow={editing && form.name && form.business ? form.business : undefined}
      back={back}
    >
      {editing && actions && (
        <div className="mb-5 grid grid-cols-4 gap-2">
          {form.phone && (
            <a href={phoneLink(form.phone)} className={actionClass}>
              <PhoneIcon size={22} />
              Call
            </a>
          )}
          {form.phone && (
            <a href={textLink(form.phone)} className={actionClass}>
              <MessageIcon size={22} />
              Text
            </a>
          )}
          {form.phone && (
            <a href={whatsappLink(form.phone, '')} target="_blank" rel="noreferrer" className={actionClass}>
              <WhatsAppIcon size={22} />
              WhatsApp
            </a>
          )}
          {form.email && (
            <a href={`mailto:${form.email}`} className={actionClass}>
              <MailIcon size={22} />
              Email
            </a>
          )}
        </div>
      )}

      {readOnly && (
        <p className="mb-4 rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-dark">
          From {sharedWithMe.find((p) => p.id === contact!.owner_id)?.name ?? 'someone else'}'s directory. Only they can
          change it.
        </p>
      )}

      {client && contact && !readOnly && <ClientHistory client={contact} />}

      {client && contact && !readOnly && <GroupLabel>Details</GroupLabel>}
      <form onSubmit={submit} className="space-y-6">
        <fieldset disabled={readOnly} className="space-y-6">
          <Card>
            <Field
              label="Name"
              autoFocus={!editing}
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder={client ? 'e.g. Sarah Cohen' : 'e.g. Joe Katz'}
            />
            <Divider />
            <Field
              label={client ? 'Company (optional)' : 'Business (optional)'}
              value={form.business}
              onChange={(e) => set({ business: e.target.value })}
              placeholder={client ? '' : 'e.g. JK Plumbing'}
            />
            <Divider />
            <Field
              label="Phone"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => set({ phone: e.target.value })}
              placeholder="(732) 555-1234"
            />
            <Divider />
            <Field
              label="Email (optional)"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
            />
            {client && (
              <>
                <Divider />
                {readOnly ? (
                  <Field label="Address" value={form.address} readOnly />
                ) : (
                  <AddressField value={form.address} onChange={(address) => set({ address })} />
                )}
              </>
            )}
          </Card>

          {!client && (
            <section>
              <GroupLabel>Categories (what they do)</GroupLabel>
              <Card className="p-3">
                {form.categories.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {form.categories.map((c) => (
                      <span
                        key={c}
                        className="flex min-h-10 items-center gap-1 rounded-full bg-brand pl-4 pr-1 text-[15px] font-semibold text-white"
                      >
                        {c}
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => set({ categories: form.categories.filter((x) => x !== c) })}
                            className="flex h-9 w-9 items-center justify-center rounded-full active:bg-brand-dark"
                            aria-label={`Remove ${c}`}
                          >
                            <CloseIcon size={16} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="px-1 text-[15px] text-muted">None yet. Tap one below or type your own.</p>
                )}
                {!readOnly && (
                  <>
                    <div className="mt-3 flex items-center gap-2 rounded-xl bg-canvas pl-3">
                      <input
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            set({ categories: addCategory(form.categories, newCategory) })
                            setNewCategory('')
                          }
                        }}
                        placeholder="Type a category, e.g. Garage doors"
                        aria-label="New category"
                        className="min-h-11 flex-1 bg-transparent text-[16px] outline-none placeholder:text-[#8e8e93]"
                      />
                      <button
                        type="button"
                        disabled={!newCategory.trim()}
                        onClick={() => {
                          set({ categories: addCategory(form.categories, newCategory) })
                          setNewCategory('')
                        }}
                        className="flex h-11 w-11 items-center justify-center text-brand disabled:opacity-30"
                        aria-label="Add category"
                      >
                        <PlusIcon size={22} />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {suggestions.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => set({ categories: addCategory(form.categories, c) })}
                          className="min-h-10 rounded-full bg-canvas px-3 text-[15px] font-medium active:opacity-60"
                        >
                          + {c}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </Card>
            </section>
          )}

          <Card>
            <TextArea
              label="Notes"
              rows={3}
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder={client ? 'e.g. Gate code 1234. Prefers texts.' : 'e.g. Fast, fair prices. Ask for Moshe.'}
            />
          </Card>
        </fieldset>

        {save.error && <ErrorNote error={save.error} />}
        {!readOnly && (
          <Button type="submit" disabled={save.isPending || !(form.name.trim() || form.business.trim())}>
            {save.isPending ? 'Saving…' : editing ? 'Save' : client ? 'Add client' : 'Add vendor'}
          </Button>
        )}
        {editing && !readOnly && (
          <Button
            type="button"
            variant="danger"
            disabled={remove.isPending}
            onClick={() => confirm(`Delete this ${client ? 'client' : 'vendor'}?`) && remove.mutate()}
          >
            Delete {client ? 'client' : 'vendor'}
          </Button>
        )}
        {remove.error && <ErrorNote error={remove.error} />}
      </form>
    </Screen>
  )
}
