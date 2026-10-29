import { randomUUID } from 'node:crypto'
import { route, json, body, param, HttpError } from '../_lib/http.js'
import { findDoc, listDocs, listDocsWhere, putDoc } from '../_lib/db.js'
import { balanceOf, invoiceWithPayments, projectAndClient, publicStudio, settingsOf, type Gallery, type Invoice } from '../_lib/studio.js'
import type { Comment } from '../../src/data/types'

// The client's view of a gallery. No login: the gallery id in the link is the key.

async function load(id: string) {
  const row = await findDoc<Gallery>('galleries', id)
  if (!row) throw new HttpError(404, 'This gallery is not available.')
  return row
}

export const GET = route(async (req) => {
  const id = param(req, 'id')
  const { owner, data: g } = await load(id)
  const [settings, favs, comments, pc, invoices] = await Promise.all([
    settingsOf(owner),
    listDocsWhere<{ photoId: string; favourite: boolean }>(owner, 'gfav', 'galleryId', id),
    listDocsWhere<Comment & { photoId: string }>(owner, 'gcomment', 'galleryId', id),
    projectAndClient(owner, g.projectId),
    listDocs<Invoice>(owner, 'invoices'),
  ])
  if (!settings) throw new HttpError(404, 'This gallery is not available.')
  // Downloads stay locked while any invoice on the project has a balance
  let balance = 0
  let invoiceId: string | undefined
  let invoiceNumber: string | undefined
  for (const r of invoices.filter((r) => r.data.projectId === g.projectId && r.data.kind === 'invoice')) {
    const inv = await invoiceWithPayments(owner, r.data)
    const b = balanceOf(inv, settings).balance
    if (b > 0) {
      balance += b
      invoiceId = inv.id
      invoiceNumber = inv.number
    }
  }
  const fav = new Map(favs.map((f) => [f.data.photoId, f.data.favourite]))
  return json({
    studio: publicStudio(settings),
    title: g.title,
    company: pc.client?.company ?? '',
    clientName: pc.client?.name ?? '',
    coverId: g.coverId,
    locked: g.lockDownloads && balance > 0,
    balance,
    invoiceId,
    invoiceNumber,
    photos: g.photos.map((p) => ({
      id: p.id,
      name: p.name,
      favourite: fav.get(p.id) ?? false,
      comments: comments
        .filter((c) => c.data.photoId === p.id)
        .map((c) => c.data)
        .sort((a, b) => a.at - b.at),
    })),
  })
})

type Action = { id: string; photoId: string } & ({ action: 'fav'; favourite: boolean } | { action: 'comment'; text: string; who: string })

export const POST = route(async (req) => {
  const a = await body<Action>(req)
  const { owner, data: g } = await load(a.id)
  if (!g.photos.some((p) => p.id === a.photoId)) throw new HttpError(404, 'Photo not found.')
  if (a.action === 'fav') {
    await putDoc(owner, 'gfav', `${a.id}:${a.photoId}`, { galleryId: a.id, photoId: a.photoId, favourite: !!a.favourite })
    return json({ ok: true })
  }
  const text = a.text.trim().slice(0, 2000)
  if (!text) throw new HttpError(400, 'Write a comment first.')
  const comment: Comment & { galleryId: string; photoId: string } = {
    id: randomUUID(),
    who: a.who.trim().slice(0, 80) || 'Client',
    text,
    at: Date.now(),
    fromClient: true,
    galleryId: a.id,
    photoId: a.photoId,
  }
  await putDoc(owner, 'gcomment', comment.id, comment)
  return json({ comment })
})
