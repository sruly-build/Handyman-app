import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Heart, Lock, MessageCircle, Send, X } from 'lucide-react'
import { isLive } from '../lib/cloud'
import { useGallery } from '../lib/publicData'
import { fmtStamp } from '../lib/dates'
import { money } from '../lib/money'
import { PhotoImg } from '../components/PhotoImg'
import { BrandMark } from '../components/StudioLogo'
import { Empty, cx } from '../components/ui'

// What the client sees from their gallery link. No login.
export function ClientGalleryScreen() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data: g, error, toggleFav, comment } = useGallery(id)
  const [view, setView] = useState<'all' | 'fav'>('all')
  const [idx, setIdx] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [note, setNote] = useState('')

  const shown = g ? g.photos.filter((p) => view === 'all' || p.favourite) : []
  const photo = idx !== null ? shown[idx] : undefined

  useEffect(() => {
    if (idx === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIdx(null)
      if (e.key === 'ArrowRight') setIdx((i) => (i === null ? i : Math.min(shown.length - 1, i + 1)))
      if (e.key === 'ArrowLeft') setIdx((i) => (i === null ? i : Math.max(0, i - 1)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [idx, shown.length])

  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(''), 3000)
    return () => clearTimeout(t)
  }, [note])

  if (!g)
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white">
        {error ? <Empty title="Gallery not available" text={error} /> : <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-accent" />}
      </div>
    )

  const cover = g.photos.find((p) => p.id === g.coverId) ?? g.photos[0]
  const favs = g.photos.filter((p) => p.favourite).length

  const download = (photoId?: string) => {
    if (g.locked) return setNote(`Downloads open once ${g.invoiceNumber ?? 'the invoice'} is paid`)
    if (!isLive) return setNote('Download started')
    location.href = photoId ? `/api/public/photo?g=${encodeURIComponent(id)}&p=${encodeURIComponent(photoId)}&download=1` : `/api/public/photo?g=${encodeURIComponent(id)}&all=1`
  }

  return (
    <div className="min-h-dvh bg-white">
      {!isLive && (
        <div className="flex items-center justify-between gap-3 bg-ink px-4 py-2 text-[12px] text-white/80">
          <span>Client view · this is what {g.clientName.split(' ')[0] || 'your client'} sees</span>
          <button onClick={() => nav(-1)} className="flex items-center gap-1 font-semibold text-white">
            <ArrowLeft size={14} /> Back to app
          </button>
        </div>
      )}

      <header className="flex items-center justify-center gap-2.5 py-5">
        <BrandMark size={32} color={g.studio.logoColor} url={g.studio.logoUrl} />
        <span className="text-[17px] font-semibold tracking-tight">{g.studio.businessName}</span>
      </header>

      {cover && (
        <div className="relative mx-auto max-w-6xl sm:px-6">
          <div className="relative overflow-hidden sm:rounded-3xl">
            <PhotoImg galleryId={id} photo={cover} large className="aspect-[4/5] w-full sm:aspect-[21/9]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-10">
              {g.company && <div className="text-[13px] font-medium tracking-wider uppercase opacity-80">{g.company}</div>}
              <h1 className="text-[34px] leading-tight font-bold tracking-tight sm:text-[48px]">{g.title}</h1>
              <div className="mt-1 text-[14px] opacity-80">{g.photos.length} photos · tap the heart on your favourites</div>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-full bg-fill p-1">
            {(['all', 'fav'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cx('h-8 rounded-full px-4 text-[14px] font-medium', view === v ? 'bg-white shadow-card' : 'text-ink-2')}>
                {v === 'all' ? 'All photos' : `Favourites (${favs})`}
              </button>
            ))}
          </div>
          <button
            onClick={() => download()}
            className={cx('ml-auto flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-semibold', g.locked ? 'bg-fill text-ink-2' : 'bg-ink text-white')}
          >
            {g.locked ? <Lock size={15} /> : <Download size={15} />}
            Download all
          </button>
        </div>
        {g.locked && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-fill px-4 py-3 text-[14px] text-ink-2">
            <Lock size={18} className="shrink-0" />
            <span className="flex-1">
              Downloads open once invoice {g.invoiceNumber} is paid ({money(g.balance)} left). You can still view, heart and comment.
            </span>
            {g.invoiceId && (
              <Link to={`/pay/${g.invoiceId}`} className="rounded-full bg-green px-4 py-2 text-[14px] font-semibold text-white">
                Pay invoice
              </Link>
            )}
          </div>
        )}

        <div className="columns-2 gap-2 sm:columns-3 lg:columns-4">
          {shown.map((ph, i) => (
            <div key={ph.id} className="relative mb-2 break-inside-avoid overflow-hidden rounded-xl">
              <button onClick={() => setIdx(i)} className="block w-full">
                <PhotoImg galleryId={id} photo={ph} className={cx('w-full', ph.kind ? (i % 3 === 1 ? 'aspect-[4/5]' : 'aspect-square') : 'h-auto min-h-24')} />
              </button>
              <button
                onClick={() => toggleFav(ph.id)}
                aria-label={ph.favourite ? 'Remove favourite' : 'Add favourite'}
                className="absolute right-2 bottom-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 backdrop-blur active:scale-90"
              >
                <Heart size={18} className={ph.favourite ? 'text-red' : 'text-ink-2'} fill={ph.favourite ? 'currentColor' : 'none'} />
              </button>
              {ph.comments.length > 0 && (
                <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[11px] text-white backdrop-blur">
                  <MessageCircle size={12} /> {ph.comments.length}
                </span>
              )}
            </div>
          ))}
        </div>
        {!shown.length && <Empty icon={<Heart size={30} />} title={view === 'fav' ? 'No favourites yet' : 'No photos yet'} text={view === 'fav' ? 'Tap the heart on any photo.' : undefined} />}

        <footer className="mt-12 mb-6 text-center text-[12px] text-ink-3">
          {g.studio.businessName}
          {g.studio.website && ` · ${g.studio.website}`}
        </footer>
      </div>

      {note && (
        <div className="anim-pop fixed inset-x-0 top-4 z-[70] mx-auto w-fit rounded-full bg-ink/90 px-4 py-2.5 text-[14px] font-medium text-white shadow-float">{note}</div>
      )}

      {photo && idx !== null && (
        <div className="anim-fade fixed inset-0 z-50 flex flex-col bg-black text-white lg:flex-row">
          <div className="relative flex min-h-0 flex-1 items-center justify-center">
            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-3 pt-[max(12px,env(safe-area-inset-top))]">
              <button onClick={() => setIdx(null)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10" aria-label="Close">
                <X size={20} />
              </button>
              <span className="text-[13px] opacity-70">
                {idx + 1} / {shown.length}
              </span>
              <span className="w-10" />
            </div>
            <PhotoImg galleryId={id} photo={photo} large className="max-h-full w-full max-w-[min(100%,80dvh)] object-contain lg:max-w-[min(100%,85dvh)]" />
            {idx > 0 && (
              <button onClick={() => setIdx(idx - 1)} className="absolute top-1/2 left-3 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15" aria-label="Previous">
                <ChevronLeft />
              </button>
            )}
            {idx < shown.length - 1 && (
              <button onClick={() => setIdx(idx + 1)} className="absolute top-1/2 right-3 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15" aria-label="Next">
                <ChevronRight />
              </button>
            )}
          </div>

          <div className={cx('flex flex-col bg-[#111] lg:w-[360px]', showComments && 'max-h-[50dvh] lg:max-h-none')}>
            <div className="flex items-center gap-2 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:pb-3">
              <div className="min-w-0 flex-1 truncate text-[14px] opacity-80">{photo.name}</div>
              <IconBtn label="Favourite" onClick={() => toggleFav(photo.id)}>
                <Heart size={20} className={photo.favourite ? 'text-[#ff375f]' : ''} fill={photo.favourite ? 'currentColor' : 'none'} />
              </IconBtn>
              <IconBtn label="Comments" onClick={() => setShowComments(!showComments)}>
                <MessageCircle size={20} />
                {photo.comments.length > 0 && <span className="text-[12px]">{photo.comments.length}</span>}
              </IconBtn>
              <IconBtn label="Download" onClick={() => download(photo.id)}>
                {g.locked ? <Lock size={18} /> : <Download size={20} />}
              </IconBtn>
            </div>
            {(showComments || window.innerWidth >= 1024) && (
              <div className="flex min-h-0 flex-1 flex-col border-t border-white/10">
                <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                  {photo.comments.map((c) => (
                    <div key={c.id} className="rounded-2xl bg-white/10 px-3.5 py-2">
                      <div className="text-[12px] opacity-60">
                        {c.fromClient ? c.who : g.studio.businessName} · {fmtStamp(c.at)}
                      </div>
                      <div className="text-[15px]">{c.text}</div>
                    </div>
                  ))}
                  {!photo.comments.length && <div className="text-[14px] opacity-50">Leave a note on this photo.</div>}
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (!text.trim() || sending) return
                    setSending(true)
                    try {
                      await comment(photo.id, text.trim())
                      setText('')
                    } catch (err) {
                      setNote(err instanceof Error ? err.message : 'Couldn’t send')
                    }
                    setSending(false)
                  }}
                  className="flex gap-2 p-3 pb-[max(12px,env(safe-area-inset-bottom))]"
                >
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Add a comment…"
                    className="h-10 flex-1 rounded-full bg-white/10 px-4 text-white outline-none placeholder:text-white/40"
                  />
                  <button type="submit" disabled={sending} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black disabled:opacity-50" aria-label="Send">
                    <Send size={16} />
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} className="flex h-10 min-w-10 items-center justify-center gap-1 rounded-full bg-white/10 px-2.5 active:bg-white/20">
      {children}
    </button>
  )
}
