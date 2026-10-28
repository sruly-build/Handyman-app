import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { backend } from '../data/backend'
import { refreshPhotos, usePhotos } from '../data/queries'
import type { Photo, PhotoKind } from '../data/types'
import { shrinkPhoto } from '../lib/images'
import { CameraIcon, CloseIcon, PencilIcon, TrashIcon } from './Icons'
import { Button, ErrorNote } from './ui'

/** Photos of one kind (before or after) for a punch list item, with a big camera button. */
export function PhotoSection({ jobId, itemId, kind }: { jobId: string; itemId: string; kind: Exclude<PhotoKind, 'sketch'> }) {
  const qc = useQueryClient()
  const { data: photos = [], error } = usePhotos(itemId)
  const cameraInput = useRef<HTMLInputElement>(null)
  const libraryInput = useRef<HTMLInputElement>(null)
  const shown = photos.filter((p) => p.kind === kind)

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) await backend.addPhoto(itemId, kind, await shrinkPhoto(file))
    },
    onSettled: () => refreshPhotos(qc),
  })

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length) upload.mutate(files)
  }

  return (
    <div>
      <PhotoGrid photos={shown} pending={upload.isPending} jobId={jobId} itemId={itemId} />

      <Button
        variant={kind === 'after' && shown.length === 0 ? 'secondary' : 'primary'}
        onClick={() => cameraInput.current?.click()}
        disabled={upload.isPending}
      >
        <CameraIcon size={24} />
        {upload.isPending ? 'Saving photo…' : `Take ${kind} photo`}
      </Button>
      <button
        onClick={() => libraryInput.current?.click()}
        className="mt-1 min-h-11 w-full text-[15px] font-medium text-brand active:opacity-50"
      >
        or choose from library
      </button>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />
      <input ref={libraryInput} type="file" accept="image/*" multiple hidden onChange={onPick} />

      {Boolean(error || upload.error) && <ErrorNote error={error || upload.error} />}
    </div>
  )
}

/** Thumbnails; tap one to see it full screen */
export function PhotoGrid({
  photos,
  pending,
  jobId,
  itemId,
}: {
  photos: Photo[]
  pending?: boolean
  jobId: string
  itemId: string
}) {
  const [viewing, setViewing] = useState<Photo | null>(null)
  const navigate = useNavigate()
  if (photos.length === 0 && !pending) return null
  return (
    <>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {photos.map((p) => (
          <button
            key={p.id}
            onClick={() => setViewing(p)}
            className="aspect-square overflow-hidden rounded-xl bg-hairline active:opacity-70"
          >
            <img src={p.url} alt={`${p.kind} photo`} className="h-full w-full object-cover" loading="lazy" />
          </button>
        ))}
        {pending && <div className="aspect-square animate-pulse rounded-xl bg-hairline" />}
      </div>
      {viewing && (
        <PhotoViewer
          photo={viewing}
          onClose={() => setViewing(null)}
          extra={
            <button
              onClick={() => navigate(`/jobs/${jobId}/items/${itemId}/sketch?photo=${viewing.id}`)}
              className="flex h-14 items-center gap-2 px-3 text-[17px] font-semibold text-white"
            >
              <PencilIcon size={24} />
              Draw on it
            </button>
          }
        />
      )}
    </>
  )
}

/** Full-screen photo with close and delete buttons */
export function PhotoViewer({ photo, onClose, extra }: { photo: Photo; onClose: () => void; extra?: ReactNode }) {
  const qc = useQueryClient()
  const remove = useMutation({
    mutationFn: () => backend.deletePhoto(photo),
    onSuccess: onClose,
    onSettled: () => refreshPhotos(qc),
  })
  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
        <button onClick={onClose} className="flex h-14 w-14 items-center justify-center text-white" aria-label="Close">
          <CloseIcon size={28} />
        </button>
        {extra}
        <button
          onClick={() => confirm('Delete this picture?') && remove.mutate()}
          disabled={remove.isPending}
          className="flex h-14 w-14 items-center justify-center text-problem disabled:opacity-40"
          aria-label="Delete"
        >
          <TrashIcon size={26} />
        </button>
      </div>
      <img src={photo.url} alt="" className="min-h-0 flex-1 bg-white object-contain pb-[env(safe-area-inset-bottom)]" />
    </div>
  )
}
