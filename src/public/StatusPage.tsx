import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckIcon, PhoneIcon } from '../components/Icons'
import { Button, Card, ErrorNote, Loading, TextArea } from '../components/ui'
import { publicApi } from '../data/backend'
import { t, type Lang, type WordKey } from '../lib/i18n'
import { phoneLink } from '../lib/links'
import { PublicShell, useLang } from './PublicShell'

/** /s/<token>: the private status link — Received → Scheduled → Done */
export function StatusPage() {
  const { token = '' } = useParams()
  const [lang, setLang] = useLang()
  const tr = (key: WordKey, vars?: Record<string, string | number>) => t(lang, key, vars)
  const { data: s, isLoading, error, refetch } = useQuery({ queryKey: ['status', token], queryFn: () => publicApi.status(token), retry: false })

  if (isLoading) return <PublicShell title={tr('statusTitle')} lang={lang} onLang={setLang}><Loading /></PublicShell>
  if (error || !s) {
    return (
      <PublicShell title={tr('statusTitle')} lang={lang} onLang={setLang}>
        {error ? <ErrorNote error={error} /> : <p className="text-[17px]">{tr('statusMissing')}</p>}
      </PublicShell>
    )
  }
  const locale = lang === 'he' ? 'he-IL' : 'en-US'
  const when = (iso: string) => new Date(iso).toLocaleString(locale, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const steps: { key: WordKey; done: boolean; note?: string }[] = [
    { key: 'received', done: true, note: tr('sentOn', { date: new Date(s.created_at).toLocaleDateString(locale, { month: 'long', day: 'numeric' }) }) },
    { key: 'scheduled', done: Boolean(s.scheduled_at) || s.status === 'done', note: s.scheduled_at ? when(s.scheduled_at) : undefined },
    { key: s.status === 'closed' ? 'closed' : 'done', done: s.status === 'done' || s.status === 'closed', note: s.done_at ? new Date(s.done_at).toLocaleDateString(locale) : undefined },
  ]

  return (
    <PublicShell title={tr('statusTitle')} company={s.company} lang={lang} onLang={setLang}>
      <Card className="px-4 py-4">
        <p className="text-[17px] font-semibold">{s.issues.join(', ')}</p>
        <ol className="mt-4 space-y-4">
          {steps.map((step, i) => (
            <li key={step.key} className="flex gap-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${step.done ? 'bg-brand text-white' : 'border-2 border-hairline text-muted'}`}>
                {step.done ? <CheckIcon size={18} strokeWidth={3} /> : i + 1}
              </span>
              <div>
                <p className={`text-[17px] font-semibold ${step.done ? '' : 'text-muted'}`}>{tr(step.key)}</p>
                {step.note && <p className="text-[15px] text-muted">{step.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {s.status === 'done' && <Feedback token={token} lang={lang} given={s.feedback} reviewUrl={s.review_url} onDone={() => void refetch()} />}

      {s.phone && (
        <a href={phoneLink(s.phone)} className="mt-6 flex min-h-12 items-center justify-center gap-2 text-[17px] font-semibold text-brand">
          <PhoneIcon size={20} /> {tr('callUs')}
        </a>
      )}
    </PublicShell>
  )
}

function Feedback({ token, lang, given, reviewUrl, onDone }: { token: string; lang: Lang; given: 'up' | 'down' | null; reviewUrl: string; onDone: () => void }) {
  const [choice, setChoice] = useState<'up' | 'down' | null>(given)
  const [note, setNote] = useState('')
  const [review, setReview] = useState(reviewUrl)
  const [sent, setSent] = useState(false)
  const send = useMutation({
    mutationFn: (happy: boolean) => publicApi.feedback(token, happy, happy ? '' : note),
    onSuccess: (r, happy) => {
      if (happy) setReview(r.review_url)
      else setSent(true)
      onDone()
    },
  })
  const big = 'flex min-h-16 flex-1 flex-col items-center justify-center rounded-2xl text-[15px] font-semibold'
  return (
    <Card className="mt-4 px-4 py-4">
      <p className="text-[17px] font-semibold">{t(lang, 'howDidWeDo')}</p>
      {!choice && (
        <div className="mt-3 flex gap-3">
          <button
            className={`${big} bg-brand-soft text-brand-dark`}
            onClick={() => {
              setChoice('up')
              send.mutate(true)
            }}
          >
            <span className="text-[28px]">👍</span>
            {t(lang, 'thumbsUp')}
          </button>
          <button className={`${big} bg-canvas text-ink`} onClick={() => setChoice('down')}>
            <span className="text-[28px]">👎</span>
            {t(lang, 'thumbsDown')}
          </button>
        </div>
      )}
      {choice === 'up' && (
        <div className="mt-2">
          <p className="text-[16px]">{review ? t(lang, 'reviewAsk') : t(lang, 'thanksFeedback')}</p>
          {review && (
            <a href={review} target="_blank" rel="noreferrer" className="mt-3 flex min-h-14 items-center justify-center rounded-2xl bg-brand text-[17px] font-semibold text-white">
              {t(lang, 'leaveReview')}
            </a>
          )}
        </div>
      )}
      {choice === 'down' &&
        (sent || given === 'down' ? (
          <p className="mt-2 text-[16px]">{t(lang, 'thanksFeedback')}</p>
        ) : (
          <div className="mt-2">
            <p className="text-[16px]">{t(lang, 'sorryAsk')}</p>
            <div className="mt-2 rounded-2xl bg-canvas">
              <TextArea aria-label={t(lang, 'sorryAsk')} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button className="mt-3" disabled={send.isPending} onClick={() => send.mutate(false)}>
              {t(lang, 'sendNote')}
            </Button>
          </div>
        ))}
      {send.error && <div className="mt-2"><ErrorNote error={send.error} /></div>}
    </Card>
  )
}
