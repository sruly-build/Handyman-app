import { HttpError, env } from './http.js'
import { getSecret, putSecret } from './db.js'

interface DropboxSecret {
  refresh_token: string
  name?: string
}

export function dropboxRedirect(origin: string): string {
  return `${origin}/api/dropbox/callback`
}

async function token(body: Record<string, string>) {
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...body, client_id: env('DROPBOX_APP_KEY'), client_secret: env('DROPBOX_APP_SECRET') }),
  })
  if (!res.ok) throw new HttpError(409, 'Dropbox access expired. Reconnect Dropbox in Settings.')
  return (await res.json()) as { access_token: string; refresh_token?: string }
}

export async function exchangeDropboxCode(owner: string, code: string, origin: string): Promise<void> {
  const t = await token({ code, grant_type: 'authorization_code', redirect_uri: dropboxRedirect(origin) })
  if (!t.refresh_token) throw new HttpError(400, 'Dropbox did not give offline access.')
  const acct = await call<{ name: { display_name: string } }>(t.access_token, 'users/get_current_account', null)
  await putSecret(owner, 'dropbox', { refresh_token: t.refresh_token, name: acct.name.display_name })
}

export async function dropboxToken(owner: string): Promise<string> {
  const s = await getSecret<DropboxSecret>(owner, 'dropbox')
  if (!s) throw new HttpError(409, 'Dropbox is not connected. Connect it in Settings.')
  return (await token({ grant_type: 'refresh_token', refresh_token: s.refresh_token })).access_token
}

export async function call<T>(accessToken: string, path: string, args: unknown): Promise<T> {
  const res = await fetch(`https://api.dropboxapi.com/2/${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, ...(args === null ? {} : { 'content-type': 'application/json' }) },
    body: args === null ? undefined : JSON.stringify(args),
  })
  if (!res.ok) throw new HttpError(502, `Dropbox error (${res.status}).`)
  return res.json() as Promise<T>
}

export interface Entry {
  '.tag': 'file' | 'folder' | 'deleted'
  id: string
  name: string
  path_lower: string
  path_display: string
}

export async function listFolder(accessToken: string, path: string): Promise<Entry[]> {
  let page = await call<{ entries: Entry[]; cursor: string; has_more: boolean }>(accessToken, 'files/list_folder', {
    path: path === '/' ? '' : path,
    limit: 2000,
  })
  const out = [...page.entries]
  while (page.has_more && out.length < 5000) {
    page = await call(accessToken, 'files/list_folder/continue', { cursor: page.cursor })
    out.push(...page.entries)
  }
  return out
}

export const IMAGE = /\.(jpe?g|png|webp|heic|tiff?|gif)$/i

export async function thumbnail(accessToken: string, path: string, size: 'w640h480' | 'w1024x768' | 'w2048h1536'): Promise<Response> {
  return fetch('https://content.dropboxapi.com/2/files/get_thumbnail_v2', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ resource: { '.tag': 'path', path }, format: 'jpeg', size, mode: 'fitone_bestfit' }),
    },
  })
}

/** A link that downloads the whole folder as a zip. */
export async function folderZipLink(accessToken: string, path: string): Promise<string> {
  const existing = await call<{ links: { url: string; path_lower?: string }[] }>(accessToken, 'sharing/list_shared_links', { path, direct_only: true })
  let url = existing.links[0]?.url
  if (!url) {
    url = (await call<{ url: string }>(accessToken, 'sharing/create_shared_link_with_settings', { path, settings: { requested_visibility: 'public' } })).url
  }
  const u = new URL(url)
  u.searchParams.set('dl', '1')
  return u.toString()
}
