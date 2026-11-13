import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Shared helpers for the app's small server (Vercel functions). Secret keys
 * live only in Vercel's settings (Project → Settings → Environment Variables),
 * never in the app's code or in anything sent to a browser.
 */

export type Req = IncomingMessage & { query?: Record<string, string | string[]>; body?: unknown }
export type Res = ServerResponse

export const env = (name: string) => (process.env[name] ?? '').trim()

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** The database with full access (server only). Throws if not set up. */
export function admin(): SupabaseClient {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL')
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new HttpError(503, 'The server is not set up yet (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function send(res: Res, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

/** The raw request body (Stripe checks its signature on these exact bytes) */
export async function rawBody(req: Req): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks)
}

export async function jsonBody<T = Record<string, unknown>>(req: Req): Promise<T> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body as T
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}') as T
  const raw = await rawBody(req)
  return (raw.length ? JSON.parse(raw.toString('utf8')) : {}) as T
}

export const query = (req: Req, name: string): string => {
  const fromQuery = req.query?.[name]
  if (typeof fromQuery === 'string') return fromQuery
  const url = new URL(req.url ?? '/', 'http://x')
  return url.searchParams.get(name) ?? ''
}

/** The logged-in person calling this (from their login token), with their company and role */
export async function caller(req: Req) {
  const header = String(req.headers.authorization ?? '')
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) throw new HttpError(401, 'Please log in.')
  const db = admin()
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Please log in again.')
  const { data: profile } = await db.from('profiles').select('company_id, role, full_name').eq('id', data.user.id).maybeSingle()
  return {
    id: data.user.id,
    email: data.user.email ?? '',
    companyId: (profile?.company_id as string | null) ?? null,
    role: (profile?.role as string | undefined) ?? 'owner',
    name: (profile?.full_name as string | undefined) ?? '',
  }
}

/** The web address the app runs at (for links in alerts and Stripe) */
export function origin(req: Req): string {
  const fixed = env('APP_URL')
  if (fixed) return fixed.replace(/\/$/, '')
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '')
  const proto = String(req.headers['x-forwarded-proto'] ?? 'https')
  return `${proto}://${host}`
}
