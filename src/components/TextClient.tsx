import { useState } from 'react'
import { useCompany } from '../data/queries'
import { useUser } from '../lib/auth'
import { smsLink } from '../lib/links'
import { CloseIcon, MessageIcon } from './Icons'
import { TextArea } from './ui'

type Kind = 'way' | 'late' | 'here' | 'custom'

const kinds: { value: Kind; label: string }[] = [
  { value: 'way', label: 'On my way' },
  { value: 'late', label: 'Running late' },
  { value: 'here', label: "I'm here" },
  { value: 'custom', label: 'My own' },
]
const minuteChoices = [10, 15, 20, 30, 45, 60]

const inTime = (minutes: number) => (minutes === 60 ? 'about an hour' : `about ${minutes} minutes`)

/** The ready-made text, e.g. "Hi Sarah, it's Dave from Dave's Handyman. I'm on my way…" */
export function arrivalMessage(kind: Kind, minutes: number, customer: string, me: string, company: string) {
  const first = customer.trim().split(/\s+/)[0] ?? ''
  const from = company && company.toLowerCase() !== me.toLowerCase() ? ` from ${company}` : ''
  const hello = `Hi${first ? ` ${first}` : ''}, it's ${me}${from}.`
  if (kind === 'way') return `${hello} I'm on my way and should be there in ${inTime(minutes)}.`
  if (kind === 'late') return `${hello} Sorry, I'm running a bit late. I should be there in ${inTime(minutes)}.`
  if (kind === 'here') return `${hello} I've arrived and I'm outside.`
  return `${hello} `
}

/** Pop-up for texting the customer when you'll be there; opens Messages with the text filled in */
export function TextClientSheet({ phone, customer, onClose }: { phone: string; customer: string; onClose: () => void }) {
  const user = useUser()
  const { data: company } = useCompany()
  const [kind, setKind] = useState<Kind>('way')
  const [minutes, setMinutes] = useState(30)
  const [edited, setEdited] = useState<string | null>(null)
  const message = edited ?? arrivalMessage(kind, minutes, customer, user.name, company?.name ?? '')

  const chip = (active: boolean) =>
    `min-h-11 rounded-full px-4 text-[15px] font-semibold transition ${
      active ? 'bg-brand text-white' : 'bg-canvas text-ink active:opacity-60'
    }`

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Text the customer"
        className="animate-sheet-up mx-auto w-full max-w-lg rounded-t-3xl bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center">
          <h2 className="flex-1 text-[20px] font-bold">Text {customer.trim().split(/\s+/)[0] || 'the customer'}</h2>
          <button onClick={onClose} className="flex h-11 w-11 items-center justify-center text-muted" aria-label="Close">
            <CloseIcon size={22} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Message">
          {kinds.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={kind === k.value}
              className={chip(kind === k.value)}
              onClick={() => {
                setKind(k.value)
                setEdited(null)
              }}
            >
              {k.label}
            </button>
          ))}
        </div>

        {(kind === 'way' || kind === 'late') && (
          <>
            <p className="mb-1.5 mt-4 text-[13px] font-semibold uppercase tracking-wide text-muted">Be there in</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Be there in">
              {minuteChoices.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={minutes === m}
                  className={chip(minutes === m)}
                  onClick={() => {
                    setMinutes(m)
                    setEdited(null)
                  }}
                >
                  {m === 60 ? '1 hour' : `${m} min`}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-4 rounded-2xl bg-canvas">
          <TextArea
            aria-label="Message to send"
            rows={4}
            value={message}
            onChange={(e) => setEdited(e.target.value)}
          />
        </div>
        <p className="mt-1.5 px-1 text-[13px] text-muted">You can change the words before sending.</p>

        <a
          href={smsLink(phone, message)}
          onClick={() => setTimeout(onClose, 300)}
          className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-[17px] font-semibold text-white active:bg-brand-dark"
        >
          <MessageIcon size={22} />
          Open in Messages
        </a>
      </div>
    </div>
  )
}
