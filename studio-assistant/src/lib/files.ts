import { supabase } from './cloud'
import type { ProjectFile } from '../data/types'

// Project files and the logo live in Supabase Storage, in a folder named after the owner's id.

async function ownerFolder(): Promise<string> {
  const { data } = await supabase!.auth.getSession()
  if (!data.session) throw new Error('Please log in again.')
  return data.session.user.id
}

export function fileKind(name: string): ProjectFile['kind'] {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'tif', 'tiff', 'svg'].includes(ext)) return 'image'
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) return 'sheet'
  if (['zip', 'rar', '7z'].includes(ext)) return 'zip'
  return 'doc'
}

export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export async function uploadProjectFile(projectId: string, fileId: string, file: File): Promise<string> {
  const path = `${await ownerFolder()}/${projectId}/${fileId}-${file.name.replace(/[^\w.\- ]+/g, '_')}`
  const { error } = await supabase!.storage.from('files').upload(path, file, { contentType: file.type || undefined })
  if (error) throw new Error(`Couldn’t upload ${file.name}: ${error.message}`)
  return path
}

export async function openFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase!.storage.from('files').createSignedUrl(path, 3600)
  if (error || !data) throw new Error('Couldn’t open this file.')
  return data.signedUrl
}

export async function deleteFile(path: string): Promise<void> {
  await supabase!.storage.from('files').remove([path])
}

/** Uploads a new logo and returns its public address. */
export async function uploadLogo(file: File): Promise<string> {
  const path = `${await ownerFolder()}/logo-${Date.now()}.${file.name.split('.').pop() || 'png'}`
  const { error } = await supabase!.storage.from('brand').upload(path, file, { contentType: file.type || undefined, upsert: true })
  if (error) throw new Error(`Couldn’t upload the logo: ${error.message}`)
  return supabase!.storage.from('brand').getPublicUrl(path).data.publicUrl
}
