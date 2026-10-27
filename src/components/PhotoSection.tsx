import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { backend } from '../data/backend'
import { keys, usePhotos } from '../data/queries'
import type { Photo, PhotoKind } from '../data/types'
import { shrinkPhoto } from '../lib/images'
import { CameraIcon, CloseIcon, TrashIcon } from './Icons'
import { Button, ErrorNote } from './ui'

/** Photos of one kind (before or after) for a punch list item, with a big camera button. */
export function PhotoSection({ itemId, kind }: { itemId: string; kind: PhotoKind }) {
  const qc = useQueryClient()
  const { data: photos = [], error } = usePhotos(itemId)
  const cameraInput = useRef<HTMLInputElement>(null)
  const libraryInput = useRef<HTMLInputElement>(null)
  const [viewing, setViewing] = useState<Photo | null>(null)
  const shown = photos.filter((p) => p.kind === kind)

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) await backend.addPhoto(itemId, kind, await shrinkPhoto(file))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.photos(itemId) }),
  })

  const remove = useMutation({
    mutationFn: (photo: Photo) => backend.deletePhoto(photo),
    onSuccess: () => setViewing(null),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.photos(itemId) }),
  })

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length) upload.mutate(files)
  }

  return (
    <div>
      {shown.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          {shown.map((p) => (
            <button
              key={p.id}
              onClick={() => setViewing(p)}
              className="aspect-square overflow-hidden rounded-xl bg-hairline active:opacity-70"
            >
              <img src={p.url} alt={`${kind} photo`} className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
          {upload.isPending && <div className="aspect-square animate-pulse rounded-xl bg-hairline" />}
        </div>
      )}

      <Button onClick={() => cameraInput.current?.click()} disabled={upload.isPending}>
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

      {(error || upload.error) && <ErrorNote error={error || upload.error} />}

      {viewing && (
        <div className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
            <button onClick={() => setViewing(null)} className="flex h-14 w-14 items-center justify-center text-white" aria-label="Close">
              <CloseIcon size={28} />
            </button>
            <button
              onClick={() => confirm('Delete this photo?') && remove.mutate(viewing)}
              disabled={remove.isPending}
              className="flex h-14 w-14 items-center justify-center text-problem disabled:opacity-40"
              aria-label="Delete photo"
            >
              <TrashIcon size={26} />
            </button>
          </div>
          <img src={viewing.url} alt="" className="min-h-0 flex-1 object-contain pb-[env(safe-area-inset-bottom)]" />
        </div>
      )}
    </div>
  )
}
