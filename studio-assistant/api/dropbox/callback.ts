import { origin } from '../_lib/http.js'
import { readState } from '../_lib/oauthState.js'
import { exchangeDropboxCode } from '../_lib/dropbox.js'

export async function GET(req: Request): Promise<Response> {
  const base = origin(req)
  const params = new URL(req.url).searchParams
  try {
    const owner = readState(params.get('state'))
    if (params.get('error')) throw new Error(params.get('error') ?? 'denied')
    await exchangeDropboxCode(owner, params.get('code') ?? '', base)
    return Response.redirect(`${base}/settings?connected=dropbox`, 302)
  } catch (e) {
    console.error(e)
    return Response.redirect(`${base}/settings?error=dropbox`, 302)
  }
}
