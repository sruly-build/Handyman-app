import { useEffect, useRef, useState } from 'react'
import { searchAddresses } from '../lib/addresses'
import { PinIcon } from './Icons'

/**
 * Address box that suggests real addresses as you type. Tap one to fill it in,
 * or just keep typing: any address is accepted.
 */
export function AddressField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const typed = useRef(false)

  useEffect(() => {
    const q = value.trim()
    // Only search after the person types (not when an existing job loads)
    if (!typed.current || q.length < 4) {
      setSuggestions([])
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      searchAddresses(q, controller.signal)
        .then((list) => setSuggestions(list.filter((s) => s !== q)))
        .catch(() => setSuggestions([])) // no signal or service down: typing still works
    }, 300)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [value])

  function pick(address: string) {
    typed.current = false
    setSuggestions([])
    setOpen(false)
    onChange(address)
  }

  const showList = open && suggestions.length > 0

  return (
    <div>
      <label className="block px-4 py-2.5">
        <span className="block text-[13px] font-medium text-muted">Address</span>
        <input
          className="w-full bg-transparent py-1 outline-none placeholder:text-[#c7c7cc]"
          value={value}
          onChange={(e) => {
            typed.current = true
            setOpen(true)
            onChange(e.target.value)
          }}
          onFocus={() => setOpen(true)}
          // Delay so a tap on a suggestion lands before the list closes
          onBlur={() => window.setTimeout(() => setOpen(false), 200)}
          autoComplete="street-address"
          placeholder="Start typing, e.g. 12 Oak Street"
          role="combobox"
          aria-expanded={showList}
          aria-autocomplete="list"
        />
      </label>
      {showList && (
        <ul role="listbox" className="animate-fade-in border-t border-hairline">
          {suggestions.map((s) => (
            <li key={s} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-[16px] active:bg-canvas"
              >
                <PinIcon size={18} className="shrink-0 text-brand" />
                <span>{s}</span>
              </button>
            </li>
          ))}
          <li className="px-4 pb-2 text-right text-[11px] text-muted">Addresses © OpenStreetMap</li>
        </ul>
      )}
    </div>
  )
}
