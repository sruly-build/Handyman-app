import type { Photo } from '../data/types'
import { ProductPhoto } from './ProductPhoto'
import { cx } from './ui'

/** A gallery photo: the real image from Dropbox, or a drawn sample photo in the preview. */
export function PhotoImg({
  galleryId,
  photo,
  large,
  className,
}: {
  galleryId: string
  photo: Pick<Photo, 'id' | 'kind' | 'bg' | 'ware' | 'accent' | 'name'>
  large?: boolean
  className?: string
}) {
  if (photo.kind && photo.bg && photo.ware && photo.accent)
    return <ProductPhoto photo={{ id: photo.id, kind: photo.kind, bg: photo.bg, ware: photo.ware, accent: photo.accent }} className={className} />
  return (
    <img
      src={photoUrl(galleryId, photo.id, large ? 'large' : 'thumb')}
      alt={photo.name}
      loading="lazy"
      className={cx('bg-fill object-cover', className)}
    />
  )
}

export function photoUrl(galleryId: string, photoId: string, size: 'thumb' | 'large'): string {
  return `/api/public/photo?g=${encodeURIComponent(galleryId)}&p=${encodeURIComponent(photoId)}&size=${size}`
}
