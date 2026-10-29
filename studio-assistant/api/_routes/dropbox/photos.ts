import { route, json, param } from '../../_lib/http.js'
import { requireUser } from '../../_lib/db.js'
import { IMAGE, dropboxToken, listFolder } from '../../_lib/dropbox.js'

// The photos in a gallery's folder, in name order.
export const GET = route(async (req) => {
  const owner = await requireUser(req)
  const entries = await listFolder(await dropboxToken(owner), param(req, 'path'))
  return json({
    photos: entries
      .filter((e) => e['.tag'] === 'file' && IMAGE.test(e.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((e) => ({ id: e.id, name: e.name.replace(/\.[^.]+$/, ''), path: e.path_display })),
  })
})
