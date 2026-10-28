import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Heart, Lock, MessageCircle, Send, X } from 'lucide-react'
import { uid, useStore } from '../data/store'
import { totals } from '../data/billing'
import { fmtStamp } from '../lib/dates'
import { money } from '../lib/money'
import type { Gallery } from '../data/types'
import { ProductPhoto } from '../components/ProductPhoto'
import { StudioLogo } from '../components/StudioLogo'
import { Empty, cx } from '../components/ui'

export function ClientGalleryScreen() {
  const { id } = useParams()
  const { state, update, toast } = useStore()
  const nav = useNavigate()
  const [view, setView] = useState<'all' | 'fav'>('all')
  const [idx, setIdx] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [showComments, setShowComments] = useState(false)
  const g = state.galleries.find((x) => x.id === id)

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

  if (!g)
    return (
      <div className="min-h-dvh bg-white">
        <Empty title="Gallery not found" />
      </div>
    )

  const project = state.projects.find((p) => p.id === g.projectId)
  const client = state.clients.find((c) => c.id === project?.clientId)
  const invoice = state.invoices.find((i) => i.projectId === g.projectId && i.kind === 'invoice')
  const balance = invoice ? totals(invoice, state.settings).balance : 0
  const locked = g.lockDownloads && balance > 0
  const cover = g.photos.find((p) => p.id === g.coverId) ?? g.photos[0]
  const favs = g.photos.filter((p) => p.favourite).length
  const editG = (fn: (g: Gallery) => void) => update((s) => fn(s.galleries.find((x) => x.id === g.id)!))

  const toggleFav = (pid: string) => editG((x) => void (x.photos.find((p) => p.id === pid)!.favourite = !x.photos.find((p) => p.id === pid)!.favourite))
  const download = () => (locked ? toast(`Downloads open once ${invoice?.number} is paid`) : toast('Download started (preview)'))

  return (
    <div className="min-h-dvh bg-white">
      <div className="flex items-center justify-between gap-3 bg-ink px-4 py-2 text-[12px] text-white/80">
        <span>Client view preview · this is what {client?.name.split(' ')[0]} sees</span>
        <button onClick={() => nav(`/projects/${g.projectId}/gallery`)} className="flex items-center gap-1 font-semibold text-white">
          <ArrowLeft size={14} /> Back to app
        </button>
      </div>

      <header className="flex items-center justify-center gap-2.5 py-5">
        <StudioLogo size={32} />
        <span className="text-[17px] font-semibold tracking-tight">{state.settings.businessName}</span>
      </header>

      <div className="relative mx-auto max-w-6xl px-0 sm:px-6">
        <div className="relative overflow-hidden sm:rounded-3xl">
          <ProductPhoto photo={cover} className="aspect-[4/5] w-full sm:aspect-[21/9]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-10">
            <div className="text-[13px] font-medium tracking-wider uppercase opacity-80">{client?.company}</div>
            <h1 className="text-[34px] leading-tight font-bold tracking-tight sm:text-[48px]">{g.title}</h1>
            <div className="mt-1 text-[14px] opacity-80">
              {g.photos.length} photos · tap the heart on your favourites
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-full bg-fill p-1">
            {(['all', 'fav'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cx('h-8 rounded-full px-4 text-[14px] font-medium', view === v ? 'bg-white shadow-card' : 'text-ink-2')}
              >
                {v === 'all' ? 'All photos' : `Favourites (${favs})`}
              </button>
            ))}
          </div>
          <button
            onClick={download}
            className={cx('ml-auto flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-semibold', locked ? 'bg-fill text-ink-2' : 'bg-ink text-white')}
          >
            {locked ? <Lock size={15} /> : <Download size={15} />}
            Download all
          </button>
        </div>
        {locked && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl bg-fill px-4 py-3 text-[14px] text-ink-2">
            <Lock size={18} className="shrink-0" />
            <span className="flex-1">
              Downloads open once invoice {invoice?.number} is paid ({money(balance)} left). You can still view, heart and comment.
            </span>
          </div>
        )}

        <div className="columns-2 gap-2 sm:columns-3 lg:columns-4">
          {shown.map((ph, i) => (
            <div key={ph.id} className="group relative mb-2 break-inside-avoid overflow-hidden rounded-xl">
              <button onClick={() => setIdx(i)} className="block w-full">
                <ProductPhoto photo={ph} className={cx('w-full', i % 3 === 1 ? 'aspect-[4/5]' : 'aspect-square')} />
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
        {!shown.length && <Empty icon={<Heart size={30} />} title="No favourites yet" text="Tap the heart on any photo." />}

        <footer className="mt-12 mb-6 text-center text-[12px] text-ink-3">
          {state.settings.businessName} · {state.settings.website}
        </footer>
      </div>

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
            <ProductPhoto photo={photo} className="max-h-full w-full max-w-[min(100%,80dvh)] lg:max-w-[min(100%,85dvh)]" />
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

          <div className={cx('flex flex-col bg-[#111] lg:w-[360px]', showComments ? 'max-h-[50dvh] lg:max-h-none' : '')}>
            <div className="flex items-center gap-2 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:pb-3">
              <div className="min-w-0 flex-1 truncate text-[14px] opacity-80">{photo.name}</div>
              <IconBtn label="Favourite" onClick={() => toggleFav(photo.id)}>
                <Heart size={20} className={photo.favourite ? 'text-[#ff375f]' : ''} fill={photo.favourite ? 'currentColor' : 'none'} />
              </IconBtn>
              <IconBtn label="Comments" onClick={() => setShowComments(!showComments)}>
                <MessageCircle size={20} />
                {photo.comments.length > 0 && <span className="text-[12px]">{photo.comments.length}</span>}
              </IconBtn>
              <IconBtn label="Download" onClick={download}>
                {locked ? <Lock size={18} /> : <Download size={20} />}
              </IconBtn>
            </div>
            {(showComments || window.innerWidth >= 1024) && (
              <div className="flex min-h-0 flex-1 flex-col border-t border-white/10">
                <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                  {photo.comments.map((c) => (
                    <div key={c.id} className="rounded-2xl bg-white/10 px-3.5 py-2">
                      <div className="text-[12px] opacity-60">
                        {c.fromClient ? c.who : state.settings.businessName} · {fmtStamp(c.at)}
                      </div>
                      <div className="text-[15px]">{c.text}</div>
                    </div>
                  ))}
                  {!photo.comments.length && <div className="text-[14px] opacity-50">Leave a note on this photo.</div>}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!comment.trim()) return
                    const text = comment.trim()
                    editG((x) =>
                      x.photos.find((p) => p.id === photo.id)!.comments.push({ id: uid('c'), who: client?.name ?? 'Client', text, at: Date.now(), fromClient: true }),
                    )
                    setComment('')
                  }}
                  className="flex gap-2 p-3 pb-[max(12px,env(safe-area-inset-bottom))]"
                >
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a comment…"
                    className="h-10 flex-1 rounded-full bg-white/10 px-4 text-white outline-none placeholder:text-white/40"
                  />
                  <button type="submit" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black" aria-label="Send">
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
