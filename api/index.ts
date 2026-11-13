import { approvalPhotos, requestReceived, testAlert } from './_lib/requests.js'
import { HttpError, query, send, type Req, type Res } from './_lib/server.js'

/**
 * The app's small server. Everything comes through this one function (Vercel's
 * free plan allows only a few), and vercel.json sends /api/<route> here.
 */
type Handler = (req: Req, res: Res) => Promise<void>

const routes: Record<string, { method: 'GET' | 'POST'; handler: Handler }> = {
  'request-received': { method: 'POST', handler: requestReceived },
  'test-alert': { method: 'POST', handler: testAlert },
  'approval-photos': { method: 'GET', handler: approvalPhotos },
}

export default async function handler(req: Req, res: Res) {
  const route = (query(req, 'route') || new URL(req.url ?? '/', 'http://x').pathname.replace(/^\/api\/?/, ''))
    .replace(/\/$/, '')
  const found = routes[route]
  try {
    if (!found) throw new HttpError(404, 'Not found.')
    if (req.method !== found.method) throw new HttpError(405, 'Wrong method.')
    await found.handler(req, res)
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    if (status === 500) console.error(route, e)
    if (!res.headersSent) send(res, status, { error: e instanceof Error ? e.message : 'Something went wrong.' })
  }
}

export const config = {
  // Stripe needs the exact bytes it sent to check the signature
  api: { bodyParser: false },
}
