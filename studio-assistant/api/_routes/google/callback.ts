import { origin } from '../../_lib/http.js'
import { readState } from '../../_lib/oauthState.js'
import { exchangeGoogleCode, saveGoogle } from '../../_lib/google.js'

// Google sends the browser back here after you allow access.
export async function GET(req: Request): Promise<Response> {
  const base = origin(req)
  const params = new URL(req.url).searchParams
  try {
    const owner = readState(params.get('state'))
    if (params.get('error')) throw new Error(params.get('error') ?? 'denied')
    const tokens = await exchangeGoogleCode(params.get('code') ?? '', base)
    if (!tokens.refresh_token) throw new Error('no refresh token')
    let email: string | undefined
    if (tokens.id_token) {
      const claims = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString()) as { email?: string }
      email = claims.email
    }
    await saveGoogle(owner, tokens.refresh_token, email)
    return Response.redirect(`${base}/settings?connected=gmail`, 302)
  } catch (e) {
    console.error(e)
    return Response.redirect(`${base}/settings?error=gmail`, 302)
  }
}
