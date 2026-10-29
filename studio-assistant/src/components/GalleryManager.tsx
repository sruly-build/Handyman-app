import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cloud, ExternalLink, FolderOpen, Heart, Image as ImageIcon, Link2, Lock, MessageCircle, RefreshCw, Star } from 'lucide-react'
import { uid, useStore } from '../data/store'
import { totals } from '../data/billing'
import { fmtStamp } from '../lib/dates'
import type { Gallery } from '../data/types'
import { PhotoImg } from './PhotoImg'
import { DropboxPicker, photosIn } from './DropboxPicker'
import { errorText } from '../lib/api'
import { Badge, Button, Card, Segmented, Sheet, Toggle, cx, inputCls } from './ui'

type Filter = 'all' | 'fav' | 'comments'

export function GalleryManager({ gallery: g }: { gallery: Gallery }) {
  const { state, update, toast, live } = useStore()
  const nav = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const [picking, setPicking] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const favs = g.photos.filter((p) => p.favourite).length
  const comments = g.photos.reduce((n, p) => n + p.comments.length, 0)
  const shown = g.photos.filter((p) => (filter === 'fav' ? p.favourite : filter === 'comments' ? p.comments.length > 0 : true))
  const photo = g.photos.find((p) => p.id === openId)
  const invoice = state.invoices.find((i) => i.projectId === g.projectId && i.kind === 'invoice')
  const balance = invoice ? totals(invoice, state.settings).balance : 0
  const editG = (fn: (g: Gallery) => void) => update((s) => fn(s.galleries.find((x) => x.id === g.id)!))

  const sync = async (path = g.dropboxPath) => {
    setSyncing(true)
    try {
      const photos = await photosIn(path, g.photos)
      editG((x) => {
        x.dropboxPath = path
        x.photos = photos
        if (!photos.some((p) => p.id === x.coverId)) x.coverId = photos[0]?.id ?? ''
      })
      toast(`${photos.length} photos from Dropbox`)
    } catch (e) {
      toast(errorText(e))
    }
    setSyncing(false)
  }

  const share = async () => {
    const url = `${location.origin}/g/${g.id}`
    try {
      await navigator.clipboard.writeText(url)
      toast('Gallery link copied')
    } catch {
      toast(url)
    }
  }

  return (
    <>
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-ink-2">
            <Cloud size={16} className="shrink-0 text-accent" />
            <span className="truncate">Dropbox: {g.dropboxPath}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {live && (
              <>
                <Button size="sm" icon={<RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />} onClick={() => void sync()} disabled={syncing}>
                  Sync
                </Button>
                <Button size="sm" icon={<FolderOpen size={14} />} onClick={() => setPicking(true)}>
                  Folder
                </Button>
              </>
            )}
            <Button size="sm" icon={<Link2 size={14} />} onClick={share}>
              Copy link
            </Button>
            <Button size="sm" variant="tinted" icon={<ExternalLink size={14} />} onClick={() => nav(`/g/${g.id}`)}>
              Client view
            </Button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-accent-soft py-2.5 text-accent">
            <div className="text-[20px] font-semibold">{g.photos.length}</div>
            <div className="text-[12px] text-ink-2">Photos</div>
          </div>
          <div className="rounded-xl bg-red-soft py-2.5 text-red">
            <div className="text-[20px] font-semibold">{favs}</div>
            <div className="text-[12px] text-ink-2">Favourites</div>
          </div>
          <div className="rounded-xl bg-purple-soft py-2.5 text-purple">
            <div className="text-[20px] font-semibold">{comments}</div>
            <div className="text-[12px] text-ink-2">Comments</div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3 border-t border-line pt-3">
          <Lock size={18} className="text-ink-2" />
          <div className="flex-1">
            <div className="text-[15px]">Lock downloads until paid</div>
            <div className="text-[12px] text-ink-3">
              {g.lockDownloads ? (balance > 0 ? `Locked: ${invoice?.number} has a balance` : 'Invoice is paid, downloads are open') : 'Client can download anytime'}
            </div>
          </div>
          <Toggle on={g.lockDownloads} onChange={(v) => editG((x) => void (x.lockDownloads = v))} label="Lock downloads until paid" />
        </div>
      </Card>

      <Segmented
        value={filter}
        onChange={setFilter}
        className="mt-4 mb-3"
        options={[
          { value: 'all', label: 'All' },
          { value: 'fav', label: `Favourites (${favs})` },
          { value: 'comments', label: 'Comments' },
        ]}
      />

      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
        {shown.map((ph) => (
          <button key={ph.id} onClick={() => setOpenId(ph.id)} className="relative aspect-square overflow-hidden rounded-xl active:opacity-80">
            <PhotoImg galleryId={g.id} photo={ph} className="h-full w-full" />
            {g.coverId === ph.id && (
              <span className="absolute top-1.5 left-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">Cover</span>
            )}
            <div className="absolute right-1.5 bottom-1.5 flex gap-1">
              {ph.comments.length > 0 && (
                <span className="flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[11px] text-white backdrop-blur">
                  <MessageCircle size={11} /> {ph.comments.length}
                </span>
              )}
              {ph.favourite && (
                <span className="flex h-[20px] w-[20px] items-center justify-center rounded-full bg-white/90">
                  <Heart size={12} className="text-red" fill="currentColor" />
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
      {!shown.length && <div className="py-10 text-center text-ink-2">Nothing here yet.</div>}

      <Sheet open={!!photo} onClose={() => setOpenId(null)} title={photo?.name ?? ''} wide>
        {photo && (
          <>
            <div className="overflow-hidden rounded-2xl">
              <PhotoImg galleryId={g.id} photo={photo} large className="aspect-square w-full object-contain lg:aspect-[4/3]" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {photo.favourite ? (
                <Badge tone="red" className="gap-1">
                  <Heart size={11} fill="currentColor" /> Client favourite
                </Badge>
              ) : (
                <Badge>Not hearted</Badge>
              )}
              <div className="ml-auto">
                {g.coverId === photo.id ? (
                  <Badge tone="blue" className="gap-1">
                    <Star size={11} fill="currentColor" /> Cover photo
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="tinted"
                    icon={<ImageIcon size={14} />}
                    onClick={() => {
                      editG((x) => void (x.coverId = photo.id))
                      toast('Set as cover')
                    }}
                  >
                    Set as cover
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-4 mb-2 px-1 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Comments</div>
            <div className="space-y-2">
              {photo.comments.map((c) => (
                <div key={c.id} className={cx('max-w-[85%] rounded-2xl px-3.5 py-2', c.fromClient ? 'bg-card' : 'ml-auto bg-accent text-white')}>
                  <div className={cx('text-[12px]', c.fromClient ? 'text-ink-2' : 'text-white/75')}>
                    {c.who} · {fmtStamp(c.at)}
                  </div>
                  <div className="text-[15px]">{c.text}</div>
                </div>
              ))}
              {!photo.comments.length && <div className="px-1 text-[14px] text-ink-3">No comments on this photo.</div>}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!reply.trim()) return
                editG((x) =>
                  x.photos
                    .find((p) => p.id === photo.id)!
                    .comments.push({ id: uid('c'), who: 'You', text: reply.trim(), at: Date.now(), fromClient: false }),
                )
                setReply('')
              }}
            >
              <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the client…" className={inputCls} />
              <Button variant="primary" type="submit">
                Send
              </Button>
            </form>
          </>
        )}
      </Sheet>
      <DropboxPicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(path) => {
          setPicking(false)
          void sync(path)
        }}
      />
    </>
  )
}
