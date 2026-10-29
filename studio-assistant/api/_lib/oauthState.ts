import { createHmac, timingSafeEqual } from 'node:crypto'
import { HttpError, env } from './http.js'

// OAuth "state": proves the callback belongs to the owner who started the connection.

function sign(payload: string): string {
  return createHmac('sha256', env('SUPABASE_SERVICE_ROLE_KEY')).update(payload).digest('base64url')
}

export function makeState(owner: string): string {
  const payload = Buffer.from(JSON.stringify({ owner, exp: Date.now() + 15 * 60_000 })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function readState(state: string | null): string {
  const [payload, mac] = (state ?? '').split('.')
  if (!payload || !mac) throw new HttpError(400, 'The connection link expired. Please try again.')
  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(mac)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new HttpError(400, 'Invalid connection link.')
  const { owner, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { owner: string; exp: number }
  if (Date.now() > exp) throw new HttpError(400, 'The connection link expired. Please try again.')
  return owner
}
