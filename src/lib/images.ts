/**
 * Phone photos are often 4–12 MB. Shrink them to at most 1600px on the long
 * side as a JPEG (usually 200–400 KB) so they upload fast on mobile data.
 */
export async function shrinkPhoto(file: File, maxSize = 1600, quality = 0.82): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('That file could not be opened as a photo.'))
      el.src = url
    })
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the photo.'))), 'image/jpeg', quality),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}
