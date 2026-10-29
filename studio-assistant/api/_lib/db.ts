import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { HttpError, env } from './http.js'

// The server uses the service role key, which bypasses row security.
// Every query here therefore filters by owner explicitly.

let client: SupabaseClient | null = null

export function admin(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL || env('VITE_SUPABASE_URL')
    client = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
  }
  return client
}

/** The logged-in studio owner, from the app's Authorization header. */
export async function requireUser(req: Request): Promise<string> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Please log in again.')
  const { data, error } = await admin().auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Please log in again.')
  return data.user.id
}

export interface DocRow<T = unknown> {
  owner: string
  kind: string
  id: string
  data: T
}

export async function getDoc<T>(owner: string, kind: string, id: string): Promise<T | null> {
  const { data, error } = await admin().from('docs').select('data').eq('owner', owner).eq('kind', kind).eq('id', id).maybeSingle()
  if (error) throw error
  return (data?.data as T) ?? null
}

/** Finds a doc by kind and id alone. Used for public links, whose ids are long and random. */
export async function findDoc<T>(kind: string, id: string): Promise<DocRow<T> | null> {
  const { data, error } = await admin().from('docs').select('owner, kind, id, data').eq('kind', kind).eq('id', id).limit(1).maybeSingle()
  if (error) throw error
  return (data as DocRow<T>) ?? null
}

export async function listDocs<T>(owner: string, kind: string): Promise<DocRow<T>[]> {
  const { data, error } = await admin().from('docs').select('owner, kind, id, data').eq('owner', owner).eq('kind', kind)
  if (error) throw error
  return (data ?? []) as DocRow<T>[]
}

export async function putDoc(owner: string, kind: string, id: string, data: unknown): Promise<void> {
  const { error } = await admin()
    .from('docs')
    .upsert({ owner, kind, id, data, updated_at: new Date().toISOString() }, { onConflict: 'owner,kind,id' })
  if (error) throw error
}

export async function getSecret<T>(owner: string, provider: string): Promise<T | null> {
  const { data, error } = await admin().from('secrets').select('data').eq('owner', owner).eq('provider', provider).maybeSingle()
  if (error) throw error
  return (data?.data as T) ?? null
}

export async function putSecret(owner: string, provider: string, data: unknown): Promise<void> {
  const { error } = await admin()
    .from('secrets')
    .upsert({ owner, provider, data, updated_at: new Date().toISOString() }, { onConflict: 'owner,provider' })
  if (error) throw error
}

export async function deleteSecret(owner: string, provider: string): Promise<void> {
  const { error } = await admin().from('secrets').delete().eq('owner', owner).eq('provider', provider)
  if (error) throw error
}

/** Every owner that has connected a provider (for the daily reminder job). */
export async function ownersWith(provider: string): Promise<string[]> {
  const { data, error } = await admin().from('secrets').select('owner').eq('provider', provider)
  if (error) throw error
  return (data ?? []).map((r) => r.owner as string)
}

export async function listDocsWhere<T>(owner: string, kind: string, field: string, value: string): Promise<DocRow<T>[]> {
  const { data, error } = await admin().from('docs').select('owner, kind, id, data').eq('owner', owner).eq('kind', kind).eq(`data->>${field}`, value)
  if (error) throw error
  return (data ?? []) as DocRow<T>[]
}
