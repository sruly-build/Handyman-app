import { useEffect, useState } from 'react'
import { ChevronRight, Folder, Images } from 'lucide-react'
import { api, errorText } from '../lib/api'
import type { Photo } from '../data/types'
import { Button, Sheet } from './ui'

interface Listing {
  path: string
  folders: { name: string; path: string }[]
  photoCount: number
}

/** Browse your Dropbox and pick the folder a gallery's photos come from. */
export function DropboxPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (path: string) => void }) {
  const [path, setPath] = useState('/')
  const [list, setList] = useState<Listing | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setList(null)
    setError('')
    api<Listing>(`dropbox/folders?path=${encodeURIComponent(path)}`)
      .then(setList)
      .catch((e) => setError(errorText(e)))
  }, [open, path])

  const crumbs = path === '/' ? [] : path.split('/').filter(Boolean)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Choose a Dropbox folder"
      footer={
        <Button variant="primary" size="lg" disabled={!list || path === '/'} onClick={() => onPick(path)}>
          {list ? `Use this folder (${list.photoCount} photos)` : 'Use this folder'}
        </Button>
      }
    >
      <div className="no-scrollbar mb-3 flex items-center gap-1 overflow-x-auto text-[14px] whitespace-nowrap">
        <button onClick={() => setPath('/')} className="text-accent">
          Dropbox
        </button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={14} className="text-ink-3" />
            <button onClick={() => setPath('/' + crumbs.slice(0, i + 1).join('/'))} className={i === crumbs.length - 1 ? 'font-semibold' : 'text-accent'}>
              {c}
            </button>
          </span>
        ))}
      </div>
      {error && <p className="rounded-xl bg-red-soft px-3.5 py-3 text-[14px] text-red">{error}</p>}
      {!list && !error && <div className="py-10 text-center text-ink-2">Loading…</div>}
      {list && (
        <div className="overflow-hidden rounded-2xl bg-card shadow-card">
          {list.photoCount > 0 && (
            <div className="flex items-center gap-3 bg-accent-soft px-4 py-3 text-[14px] text-accent">
              <Images size={18} /> {list.photoCount} photos in this folder
            </div>
          )}
          {list.folders.map((f) => (
            <button key={f.path} onClick={() => setPath(f.path)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-fill [&+&]:border-t [&+&]:border-line">
              <Folder size={20} className="text-accent" fill="currentColor" fillOpacity={0.15} />
              <span className="flex-1 truncate">{f.name}</span>
              <ChevronRight size={16} className="text-ink-3" />
            </button>
          ))}
          {!list.folders.length && !list.photoCount && <div className="px-4 py-6 text-center text-[14px] text-ink-2">This folder is empty.</div>}
        </div>
      )}
    </Sheet>
  )
}

/** The photos in a folder, ready to merge into a gallery (keeping hearts and comments by photo id). */
export async function photosIn(path: string, existing: Photo[] = []): Promise<Photo[]> {
  const { photos } = await api<{ photos: { id: string; name: string; path: string }[] }>(`dropbox/photos?path=${encodeURIComponent(path)}`)
  return photos.map((p) => {
    const old = existing.find((e) => e.id === p.id)
    return { id: p.id, name: p.name, path: p.path, favourite: old?.favourite ?? false, comments: old?.comments ?? [] }
  })
}
