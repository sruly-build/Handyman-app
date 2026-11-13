import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon, PhoneIcon, WhatsAppIcon } from '../components/Icons'
import { say } from '../data/guides'
import type { PublicGuide } from '../data/publicApi'
import { dirOf, t, type Lang } from '../lib/i18n'
import { phoneLink } from '../lib/links'

/** WhatsApp chat with us (for a video call), no message filled in */
export function whatsappChat(number: string) {
  let digits = number.replace(/\D/g, '')
  if (!number.trim().startsWith('+') && digits.length === 10) digits = `1${digits}`
  return `https://wa.me/${digits}`
}

/**
 * "Try this first": one safe check at a time. Ends with "That fixed it" or
 * "Still not working: send request" (what they tried goes with the request).
 */
export function GuideSheet({
  guide,
  lang,
  phone,
  whatsapp,
  onFixed,
  onStill,
  onClose,
}: {
  guide: PublicGuide
  lang: Lang
  phone: string
  whatsapp: string
  onFixed: () => void
  onStill: (tried: string[]) => void
  onClose: () => void
}) {
  const [step, setStep] = useState(0)
  const [fixed, setFixed] = useState(false)
  const total = guide.steps.length
  const atEnd = step >= total
  const current = guide.steps[step]
  // What they tried, in English, so we can read it
  const tried = guide.steps.slice(0, step).map((s) => s.q.en)
  const big = 'flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-4 text-[17px] font-semibold'

  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label={say(guide.title, lang)}
        dir={dirOf(lang)}
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up mx-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4"
      >
        <div className="mb-2 flex items-center">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-brand">{t(lang, 'tryThisFirst')}</p>
            <h2 className="text-[20px] font-bold">{say(guide.title, lang)}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center text-muted" aria-label="Close">
            <CloseIcon size={22} />
          </button>
        </div>

        {fixed ? (
          <div className="py-4 text-center">
            <p className="text-[19px] font-semibold">{t(lang, 'glad')}</p>
            <button type="button" className={`${big} mt-5 bg-brand text-white`} onClick={onFixed}>
              OK
            </button>
          </div>
        ) : atEnd ? (
          <div className="py-2">
            <p className="text-[19px] font-semibold">{t(lang, 'stillTitle')}</p>
            <p className="mt-1 text-[16px] text-muted">{t(lang, 'stillBody')}</p>
            <button type="button" className={`${big} mt-5 bg-brand text-white`} onClick={() => onStill(guide.steps.map((s) => s.q.en))}>
              {t(lang, 'stillBroken')}
            </button>
          </div>
        ) : (
          <div className="py-2">
            <p className="text-[13px] font-semibold text-muted">{t(lang, 'stepOf', { n: step + 1, total })}</p>
            <p className="mt-1 text-[19px] font-semibold leading-snug">{say(current.q, lang)}</p>
            {current.tip && say(current.tip, lang) && (
              <p className="mt-3 rounded-2xl bg-progress-soft px-4 py-3 text-[15px] text-[#8a4b00]">{say(current.tip, lang)}</p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" className={`${big} bg-brand-soft text-brand-dark`} onClick={() => setFixed(true)}>
                {t(lang, 'fixedIt')}
              </button>
              <button type="button" className={`${big} bg-canvas text-ink`} onClick={() => setStep(step + 1)}>
                {t(lang, 'didntHelp')}
              </button>
            </div>
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)} className="mt-3 min-h-11 px-1 text-[15px] font-semibold text-brand">
                {t(lang, 'back')}
              </button>
            )}
            <button type="button" onClick={() => onStill(tried)} className="mt-1 block min-h-11 px-1 text-[15px] font-semibold text-muted">
              {t(lang, 'skipGuide')}
            </button>
          </div>
        )}

        {(phone || whatsapp) && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-hairline pt-4">
            {phone && (
              <a href={phoneLink(phone)} className={`${big} bg-canvas text-brand`}>
                <PhoneIcon size={20} /> {t(lang, 'callForHelp')}
              </a>
            )}
            {whatsapp && (
              <a href={whatsappChat(whatsapp)} target="_blank" rel="noreferrer" className={`${big} bg-[#25D366] text-white`}>
                <WhatsAppIcon size={20} /> {t(lang, 'videoCall')}
              </a>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
