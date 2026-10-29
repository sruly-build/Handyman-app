import { route, json, env, origin } from '../_lib/http.js'
import { requireUser } from '../_lib/db.js'
import { makeState } from '../_lib/oauthState.js'
import { dropboxRedirect } from '../_lib/dropbox.js'

export const GET = route(async (req) => {
  const owner = await requireUser(req)
  const url = new URL('https://www.dropbox.com/oauth2/authorize')
  url.search = new URLSearchParams({
    client_id: env('DROPBOX_APP_KEY'),
    redirect_uri: dropboxRedirect(origin(req)),
    response_type: 'code',
    token_access_type: 'offline',
    state: makeState(owner),
  }).toString()
  return json({ url: url.toString() })
})
