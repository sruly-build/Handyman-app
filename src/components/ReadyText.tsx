import { useState } from 'react'
import { smsLink, whatsappLink } from '../lib/links'
import { MessageIcon, WhatsAppIcon } from './Icons'
import { Sheet } from './Sales'
import { TextArea } from './ui'

export interface ReadyChoice {
  label: string
  text: string
}

/**
 * A ready-made message: pick one, change the words if you like, then send it
 * from your own phone by text or WhatsApp. Nothing is sent automatically.
 */
export function ReadyTextSheet({
  phone,
  title,
  choices,
  onClose,
  onSent,
}: {
  phone: string
  title: string
  choices: ReadyChoice[]
  onClose: () => void
  onSent?: () => void
}) {
  const [pick, setPick] = useState(0)
  const [edited, setEdited] = useState<string | null>(null)
  const message = edited ?? choices[pick]?.text ?? ''
  const chip = (active: boolean) =>
    `min-h-11 rounded-full px-4 text-[15px] font-semibold transition ${active ? 'bg-brand text-white' : 'bg-canvas text-ink active:opacity-60'}`
  const sent = () => {
    onSent?.()
    window.setTimeout(onClose, 300)
  }
  return (
    <Sheet title={title} onClose={onClose}>
      {choices.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Message">
          {choices.map((c, i) => (
            <button
              key={c.label}
              type="button"
              role="radio"
              aria-checked={pick === i}
              className={chip(pick === i)}
              onClick={() => {
                setPick(i)
                setEdited(null)
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="rounded-2xl bg-canvas">
        <TextArea aria-label="Message to send" rows={5} value={message} onChange={(e) => setEdited(e.target.value)} />
      </div>
      <p className="mt-1.5 px-1 text-[13px] text-muted">You can change the words before sending.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <a
          href={smsLink(phone, message)}
          onClick={sent}
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-brand text-[17px] font-semibold text-white active:bg-brand-dark"
        >
          <MessageIcon size={22} />
          Text
        </a>
        <a
          href={whatsappLink(phone, message)}
          target="_blank"
          rel="noreferrer"
          onClick={sent}
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-[17px] font-semibold text-white active:opacity-80"
        >
          <WhatsAppIcon size={22} />
          WhatsApp
        </a>
      </div>
    </Sheet>
  )
}
