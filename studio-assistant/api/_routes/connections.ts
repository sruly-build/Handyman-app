import { route, json, hasEnv, param } from '../_lib/http.js'
import { deleteSecret, getSecret, requireUser } from '../_lib/db.js'

// What's connected, for the Settings screen.
export const GET = route(async (req) => {
  const owner = await requireUser(req)
  const [google, dropbox] = await Promise.all([
    getSecret<{ email?: string }>(owner, 'google'),
    getSecret<{ name?: string }>(owner, 'dropbox'),
  ])
  return json({
    gmail: { ready: hasEnv('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'), connected: !!google, account: google?.email ?? null },
    dropbox: { ready: hasEnv('DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET'), connected: !!dropbox, account: dropbox?.name ?? null },
    stripe: { ready: hasEnv('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET') },
    ai: { ready: hasEnv('ANTHROPIC_API_KEY') },
  })
})

export const DELETE = route(async (req) => {
  const owner = await requireUser(req)
  const provider = param(req, 'provider')
  if (provider === 'google' || provider === 'dropbox') await deleteSecret(owner, provider)
  return json({ ok: true })
})
