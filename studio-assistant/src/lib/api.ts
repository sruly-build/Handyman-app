import { isLive, supabase } from './cloud'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Calls the app's server routes, logged in as the studio owner. */
export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const headers: Record<string, string> = {}
  if (isLive) {
    const { data } = await supabase!.auth.getSession()
    if (data.session) headers.authorization = `Bearer ${data.session.access_token}`
  }
  if (init?.body !== undefined) headers['content-type'] = 'application/json'
  let res: Response
  try {
    res = await fetch(`/api/${path}`, {
      method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'No connection. Check your internet and try again.')
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong.')
  return data
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.'
}
