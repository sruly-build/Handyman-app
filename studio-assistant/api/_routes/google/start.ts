import { route, json, env, origin } from '../../_lib/http.js'
import { requireUser } from '../../_lib/db.js'
import { makeState } from '../../_lib/oauthState.js'
import { GOOGLE_SCOPES, googleRedirect } from '../../_lib/google.js'

// Returns the Google consent page address; the app sends the browser there.
export const GET = route(async (req) => {
  const owner = await requireUser(req)
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'),
    redirect_uri: googleRedirect(origin(req)),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: makeState(owner),
  }).toString()
  return json({ url: url.toString() })
})
