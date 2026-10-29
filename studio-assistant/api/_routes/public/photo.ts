import { route, json, param, HttpError } from '../../_lib/http.js'
import { findDoc, listDocs } from '../../_lib/db.js'
import { dropboxToken, folderZipLink, call, thumbnail } from '../../_lib/dropbox.js'
import { balanceOf, invoiceWithPayments, settingsOf, type Gallery, type Invoice } from '../../_lib/studio.js'

// Photo images for a gallery (from Dropbox), and downloads when they are unlocked.
// ?g=<gallery>&p=<photo>&size=thumb|large  → the image
// ?g=<gallery>&p=<photo>&download=1        → the original file
// ?g=<gallery>&all=1                        → the whole folder as a zip

export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams
  const row = await findDoc<Gallery>('galleries', param(req, 'g'))
  if (!row) throw new HttpError(404, 'Not found')
  const { owner, data: g } = row

  if (q.get('download') || q.get('all')) {
    if (g.lockDownloads) {
      const settings = await settingsOf(owner)
      const invoices = (await listDocs<Invoice>(owner, 'invoices')).filter((r) => r.data.projectId === g.projectId && r.data.kind === 'invoice')
      for (const r of invoices) {
        if (settings && balanceOf(await invoiceWithPayments(owner, r.data), settings).balance > 0) {
          throw new HttpError(403, 'Downloads open once the invoice is paid.')
        }
      }
    }
    const token = await dropboxToken(owner)
    if (q.get('all')) return Response.redirect(await folderZipLink(token, g.dropboxPath), 302)
    const photo = g.photos.find((p) => p.id === q.get('p'))
    if (!photo?.path) throw new HttpError(404, 'Not found')
    const { link } = await call<{ link: string }>(token, 'files/get_temporary_link', { path: photo.path })
    return Response.redirect(link, 302)
  }

  const photo = g.photos.find((p) => p.id === q.get('p'))
  if (!photo?.path) return json({ error: 'Not found' }, 404)
  const img = await thumbnail(await dropboxToken(owner), photo.path, q.get('size') === 'large' ? 'w2048h1536' : 'w640h480')
  if (!img.ok) return json({ error: 'Image not available' }, 404)
  return new Response(img.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400' } })
})
