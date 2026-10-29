import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MessageIcon, PeopleIcon, PhoneIcon, PlusIcon, SearchIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { Card, Divider, EmptyState, ErrorNote, Loading, Segmented } from '../components/ui'
import { categoriesInUse, matchesSearch } from '../data/directory'
import { useContacts, useDirectoryShares, useSharedDirectories } from '../data/queries'
import type { Contact, ContactKind } from '../data/types'
import { useUser } from '../lib/auth'
import { phoneLink, textLink } from '../lib/links'

/** My clients and vendors, searchable by name, business, address or category (plumbing, electric…) */
const countOf = (list: Contact[], kind: ContactKind) => {
  const n = list.filter((c) => c.kind === kind).length
  return n ? ` (${n})` : ''
}

export function DirectoryScreen() {
  const user = useUser()
  const { data: contacts, isLoading, error } = useContacts()
  const { data: shares = [] } = useDirectoryShares()
  const { data: sharedWithMe = [] } = useSharedDirectories()
  const [params, setParams] = useSearchParams()
  // Kept in the address so Back from a contact returns to the same part
  const kind: ContactKind = params.get('show') === 'clients' ? 'client' : 'vendor'
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)

  const everyone = contacts ?? []
  const all = everyone.filter((c) => c.kind === kind)
  const categories = categoriesInUse(all)
  const shown = all.filter(
    (c) =>
      matchesSearch(c, query) &&
      (category === null || c.categories.some((x) => x.toLowerCase() === category.toLowerCase())),
  )
  const ownerName = (c: Contact) => sharedWithMe.find((p) => p.id === c.owner_id)?.name ?? 'someone else'

  const chip = (active: boolean) =>
    `shrink-0 min-h-10 rounded-full px-4 text-[15px] font-semibold transition ${
      active ? 'bg-brand text-white' : 'bg-card text-ink active:opacity-60'
    }`

  return (
    <Screen
      title="Directory"
      back={{ to: '/more', label: 'Me' }}
      action={
        <Link
          to={`/directory/new?kind=${kind}`}
          className="flex min-h-11 items-center gap-1 px-1 text-[17px] text-brand active:opacity-50"
          aria-label={kind === 'client' ? 'Add client' : 'Add vendor'}
        >
          <PlusIcon size={20} strokeWidth={2.4} />
          Add
        </Link>
      }
    >
      <Segmented
        label="Show"
        value={kind}
        onChange={(k) => {
          setParams(k === 'client' ? { show: 'clients' } : {}, { replace: true })
          setCategory(null)
        }}
        options={[
          { value: 'vendor', label: `Vendors${countOf(everyone, 'vendor')}` },
          { value: 'client', label: `Clients${countOf(everyone, 'client')}` },
        ]}
      />

      <label className="mt-3 flex min-h-12 items-center gap-2 rounded-2xl bg-card px-4">
        <SearchIcon size={20} className="shrink-0 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={kind === 'client' ? 'Search: a name, street or town…' : 'Search: plumbing, electric, a name…'}
          aria-label="Search the directory"
          className="w-full bg-transparent py-2 text-[17px] outline-none placeholder:text-[#8e8e93]"
        />
      </label>

      {categories.length > 0 && (
        <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1" role="radiogroup" aria-label="Category">
          <button
            type="button"
            role="radio"
            aria-checked={category === null}
            className={chip(category === null)}
            onClick={() => setCategory(null)}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={category === c}
              className={chip(category === c)}
              onClick={() => setCategory(category === c ? null : c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4">
        {isLoading && <Loading />}
        {error && <ErrorNote error={error} />}
        {contacts && all.length === 0 && kind === 'vendor' && (
          <EmptyState title="No vendors yet">
            Add the people you call: plumbers, electricians, sheetrock guys, suppliers. Give each one a category so you
            can find them fast.
          </EmptyState>
        )}
        {contacts && all.length === 0 && kind === 'client' && (
          <EmptyState title="No clients yet">Add your customers with their phone and address.</EmptyState>
        )}
        {contacts && all.length > 0 && shown.length === 0 && (
          <EmptyState title="Nobody found">Try another word, or tap All.</EmptyState>
        )}
        {shown.length > 0 && (
          <Card>
            {shown.map((c, i) => (
              <div key={c.id}>
                {i > 0 && <Divider />}
                <div className="flex items-center">
                  <Link to={`/directory/${c.id}`} className="min-w-0 flex-1 py-2.5 pl-4 active:opacity-60">
                    <p className="truncate text-[17px] font-semibold">{c.name || c.business || 'No name'}</p>
                    {c.name && c.business && <p className="truncate text-[15px] text-muted">{c.business}</p>}
                    {c.kind === 'client' && c.address && <p className="truncate text-[15px] text-muted">{c.address}</p>}
                    {c.categories.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-1">
                        {c.categories.map((cat) => (
                          <span
                            key={cat}
                            className="rounded-full bg-brand-soft px-2 py-0.5 text-[12px] font-semibold text-brand-dark"
                          >
                            {cat}
                          </span>
                        ))}
                      </p>
                    )}
                    {c.owner_id !== user.id && (
                      <p className="mt-0.5 text-[13px] text-muted">From {ownerName(c)}'s directory</p>
                    )}
                  </Link>
                  {c.phone && (
                    <>
                      <a
                        href={textLink(c.phone)}
                        className="flex h-14 w-11 shrink-0 items-center justify-center text-brand active:opacity-50"
                        aria-label={`Text ${c.name || c.business}`}
                      >
                        <MessageIcon size={22} />
                      </a>
                      <a
                        href={phoneLink(c.phone)}
                        className="mr-2 flex h-14 w-11 shrink-0 items-center justify-center text-brand active:opacity-50"
                        aria-label={`Call ${c.name || c.business}`}
                      >
                        <PhoneIcon size={22} />
                      </a>
                    </>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      <Link
        to="/directory/sharing"
        className="mt-4 flex min-h-8 items-center gap-1.5 px-1 text-[13px] text-muted active:opacity-50"
      >
        <PeopleIcon size={14} className="shrink-0" />
        <span className="truncate">
          {shares.length
            ? `Shared with ${shares.map((s) => s.name).join(', ')}`
            : 'Private: only you can see your directory'}
        </span>
      </Link>
    </Screen>
  )
}
