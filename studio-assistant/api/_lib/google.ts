import { HttpError, env } from './http.js'
import { getSecret, putSecret } from './db.js'

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
]

interface GoogleSecret {
  refresh_token: string
  email?: string
}

export function googleRedirect(origin: string): string {
  return `${origin}/api/google/callback`
}

export async function exchangeGoogleCode(code: string, origin: string): Promise<{ refresh_token?: string; access_token: string; id_token?: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      redirect_uri: googleRedirect(origin),
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new HttpError(400, 'Google did not accept the connection. Please try again.')
  return res.json()
}

async function accessToken(owner: string): Promise<string> {
  const secret = await getSecret<GoogleSecret>(owner, 'google')
  if (!secret) throw new HttpError(409, 'Gmail is not connected. Connect it in Settings.')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      refresh_token: secret.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new HttpError(409, 'Gmail access expired. Reconnect Gmail in Settings.')
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

export async function saveGoogle(owner: string, refreshToken: string, email: string | undefined): Promise<void> {
  await putSecret(owner, 'google', { refresh_token: refreshToken, email })
}

export async function gmail<T>(owner: string, path: string, init?: RequestInit, token?: string): Promise<T> {
  const t = token ?? (await accessToken(owner))
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) throw new HttpError(502, `Gmail error (${res.status}).`)
  return res.json() as Promise<T>
}

export async function gmailToken(owner: string): Promise<string> {
  return accessToken(owner)
}

interface Part {
  mimeType?: string
  body?: { data?: string }
  parts?: Part[]
  headers?: { name: string; value: string }[]
}

export interface GmailMessage {
  id: string
  threadId: string
  snippet: string
  internalDate: string
  labelIds?: string[]
  payload: Part
}

export function header(m: GmailMessage, name: string): string {
  return m.payload.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function decode(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8')
}

/** The readable text of an email: the plain-text part, else the HTML part with tags removed. */
export function textOf(m: GmailMessage): string {
  const find = (p: Part, type: string): string | null => {
    if (p.mimeType === type && p.body?.data) return decode(p.body.data)
    for (const c of p.parts ?? []) {
      const r = find(c, type)
      if (r) return r
    }
    return null
  }
  const plain = find(m.payload, 'text/plain')
  const text =
    plain ??
    find(m.payload, 'text/html')
      ?.replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&') ??
    m.snippet
  // Drop the quoted earlier conversation so only the new message remains
  const cut = text.search(/\n(On .+ wrote:|-{2,} ?Original Message|From: .+\nSent: )/)
  return (cut > 0 ? text.slice(0, cut) : text).replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000)
}

/** "Noa Friedman <noa@x.com>" → { name, email } */
export function parseAddress(v: string): { name: string; email: string } {
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/)
  if (m) return { name: m[1].trim() || m[2], email: m[2].trim().toLowerCase() }
  const email = v.trim().toLowerCase()
  return { name: email, email }
}

function encodeHeader(v: string): string {
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v).toString('base64')}?=`
}

export async function sendEmail(
  owner: string,
  msg: { to: string; subject: string; text: string; threadId?: string; inReplyTo?: string; fromName?: string },
): Promise<void> {
  const lines = [
    `To: ${msg.to}`,
    `Subject: ${encodeHeader(msg.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ]
  if (msg.inReplyTo) lines.push(`In-Reply-To: ${msg.inReplyTo}`, `References: ${msg.inReplyTo}`)
  const raw = Buffer.from(`${lines.join('\r\n')}\r\n\r\n${Buffer.from(msg.text).toString('base64')}`).toString('base64url')
  await gmail(owner, 'messages/send', { method: 'POST', body: JSON.stringify({ raw, threadId: msg.threadId }) })
}
