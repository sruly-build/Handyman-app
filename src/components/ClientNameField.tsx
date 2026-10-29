import { useState } from 'react'
import { matchesSearch } from '../data/directory'
import type { Contact } from '../data/types'
import { PeopleIcon } from './Icons'

/**
 * The customer name on a job. Suggests clients from my directory as I type;
 * picking one fills in their details. A new name becomes a new client when the job is saved.
 */
export function ClientNameField({
  value,
  clients,
  linked,
  autoFocus,
  onType,
  onPick,
}: {
  value: string
  clients: Contact[]
  /** The client the job is linked to, if any */
  linked: Contact | undefined
  autoFocus?: boolean
  onType: (name: string) => void
  onPick: (client: Contact) => void
}) {
  const [open, setOpen] = useState(false)
  const q = value.trim()
  const matches = q && !linked ? clients.filter((c) => matchesSearch(c, q)).slice(0, 5) : []
  const showList = open && matches.length > 0

  return (
    <div>
      <label className="block px-4 py-2.5">
        <span className="block text-[13px] font-medium text-muted">Name</span>
        <input
          className="w-full bg-transparent py-1 outline-none placeholder:text-[#c7c7cc]"
          required
          autoFocus={autoFocus}
          autoCapitalize="words"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setOpen(true)
            onType(e.target.value)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 200)}
          placeholder="e.g. Sarah Cohen"
          role="combobox"
          aria-expanded={showList}
          aria-autocomplete="list"
          aria-label="Name"
        />
        {linked ? (
          <span className="mt-0.5 flex items-center gap-1 text-[13px] text-brand-dark">
            <PeopleIcon size={13} /> Your client{linked.phone ? ` · ${linked.phone}` : ''}
          </span>
        ) : (
          q && (
            <span className="mt-0.5 block text-[13px] text-muted">
              {matches.length
                ? 'Pick a client below, or keep typing for a new one'
                : 'New client: added to your Clients when you save'}
            </span>
          )
        )}
      </label>
      {showList && (
        <ul role="listbox" aria-label="Your clients" className="animate-fade-in border-t border-hairline">
          {matches.map((c) => (
            <li key={c.id} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false)
                  onPick(c)
                }}
                className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left active:bg-canvas"
              >
                <PeopleIcon size={18} className="shrink-0 text-brand" />
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-medium">{c.name || c.business}</span>
                  {(c.address || c.phone) && (
                    <span className="block truncate text-[13px] text-muted">{c.address || c.phone}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
