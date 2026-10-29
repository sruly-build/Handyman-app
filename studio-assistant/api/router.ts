import { json } from './_lib/http.js'
import * as r0 from './_routes/ai/draft.js'
import * as r1 from './_routes/connections.js'
import * as r2 from './_routes/dropbox/callback.js'
import * as r3 from './_routes/dropbox/folders.js'
import * as r4 from './_routes/dropbox/photos.js'
import * as r5 from './_routes/dropbox/start.js'
import * as r6 from './_routes/gmail/contacts.js'
import * as r7 from './_routes/gmail/inbox.js'
import * as r8 from './_routes/gmail/send.js'
import * as r9 from './_routes/google/callback.js'
import * as r10 from './_routes/google/start.js'
import * as r11 from './_routes/public/gallery.js'
import * as r12 from './_routes/public/invoice.js'
import * as r13 from './_routes/public/photo.js'
import * as r14 from './_routes/stripe/checkout.js'
import * as r15 from './_routes/stripe/webhook.js'

// Vercel's free plan allows 12 functions per deployment, so every /api/... address
// (except the daily cron job) is served by this one function. vercel.json rewrites
// /api/<path> to /api/router?path=<path>; each route keeps its own file in _routes/.

type Handler = (req: Request) => Promise<Response>
type Route = Partial<Record<'GET' | 'POST' | 'DELETE', Handler>>

const ROUTES: Record<string, Route> = {
  'ai/draft': r0,
  'connections': r1,
  'dropbox/callback': r2,
  'dropbox/folders': r3,
  'dropbox/photos': r4,
  'dropbox/start': r5,
  'gmail/contacts': r6,
  'gmail/inbox': r7,
  'gmail/send': r8,
  'google/callback': r9,
  'google/start': r10,
  'public/gallery': r11,
  'public/invoice': r12,
  'public/photo': r13,
  'stripe/checkout': r14,
  'stripe/webhook': r15,
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = (url.searchParams.get('path') ?? url.pathname.replace(/^\/api\//, '')).replace(/^\/+|\/+$/g, '')
  const route = ROUTES[path]
  if (!route) return json({ error: 'Not found' }, 404)
  const fn = route[req.method as keyof Route]
  if (!fn) return json({ error: 'Method not allowed' }, 405)
  return fn(req)
}

export const GET = handle
export const POST = handle
export const DELETE = handle
