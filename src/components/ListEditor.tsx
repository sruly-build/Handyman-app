import { useState, type FormEvent } from 'react'
import { CloseIcon, PlusIcon } from './Icons'
import { Card, Divider } from './ui'

/** A simple list of short lines (tools, materials) with an add box */
export function ListEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string[]
  onChange: (next: string[]) => void
  placeholder: string
}) {
  const [text, setText] = useState('')

  function add(e: FormEvent) {
    e.preventDefault()
    // Allow pasting several at once, separated by commas or new lines
    const fresh = text
      .split(/[\n,]/)
      .map((t) => t.trim())
      .filter((t) => t && !value.some((v) => v.toLowerCase() === t.toLowerCase()))
    if (fresh.length) onChange([...value, ...fresh])
    setText('')
  }

  return (
    <Card>
      {value.map((t, i) => (
        <div key={`${t}-${i}`}>
          {i > 0 && <Divider />}
          <div className="flex min-h-12 items-center gap-2 pl-4">
            <span className="flex-1 text-[17px]">{t}</span>
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="flex h-12 w-12 items-center justify-center text-muted active:opacity-50"
              aria-label={`Remove ${t}`}
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </div>
      ))}
      {value.length > 0 && <Divider />}
      <form onSubmit={add} className="flex items-center gap-2 pl-4">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          enterKeyHint="done"
          className="min-h-12 flex-1 bg-transparent outline-none placeholder:text-[#c7c7cc]"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="flex h-12 w-12 items-center justify-center text-brand disabled:text-[#c7c7cc]"
          aria-label="Add"
        >
          <PlusIcon size={24} strokeWidth={2.6} />
        </button>
      </form>
    </Card>
  )
}
