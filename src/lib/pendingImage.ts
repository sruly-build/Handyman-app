/**
 * Hands a just-picked photo to the drawing screen without uploading it first
 * (only the marked-up result is saved).
 */
let pending: Blob | null = null

export function setPendingImage(image: Blob) {
  pending = image
}

/** The photo waiting to be drawn on (kept until the next one is picked) */
export function takePendingImage(): Blob | null {
  return pending
}
