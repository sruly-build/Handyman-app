import { route, json } from '../_lib/http.js'
import { requireUser } from '../_lib/db.js'
import { IMAGE, dropboxToken, listFolder } from '../_lib/dropbox.js'

// Folder browser for picking a gallery folder: sub-folders plus how many photos are in this one.
export const GET = route(async (req) => {
  const owner = await requireUser(req)
  const path = new URL(req.url).searchParams.get('path') || '/'
  const entries = await listFolder(await dropboxToken(owner), path)
  return json({
    path,
    folders: entries
      .filter((e) => e['.tag'] === 'folder')
      .map((e) => ({ name: e.name, path: e.path_display }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    photoCount: entries.filter((e) => e['.tag'] === 'file' && IMAGE.test(e.name)).length,
  })
})
