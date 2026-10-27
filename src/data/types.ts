export type ItemStatus = 'todo' | 'in_progress' | 'done'
export type PhotoKind = 'before' | 'after'

export interface AppUser {
  id: string
  email: string
  name: string
}

export interface Job {
  id: string
  customer_name: string
  customer_phone: string
  customer_email: string
  address: string
  /** Calendar date as YYYY-MM-DD, or null if not booked yet */
  job_date: string | null
  notes: string
  created_at: string
}

/** A job plus a count of its punch list items, for list screens */
export interface JobSummary extends Job {
  item_count: number
  done_count: number
  in_progress_count: number
}

export interface Measurement {
  id: string
  label: string
  width: string
  height: string
  depth: string
  unit: 'in' | 'ft' | 'cm' | 'mm' | 'm'
  note: string
}

export interface PunchItem {
  id: string
  job_id: string
  title: string
  location: string
  notes: string
  status: ItemStatus
  measurements: Measurement[]
  position: number
  created_at: string
}

export interface Photo {
  id: string
  item_id: string
  kind: PhotoKind
  /** A URL the browser can show directly */
  url: string
  created_at: string
}

export type JobInput = Omit<Job, 'id' | 'created_at'>
export type ItemPatch = Partial<Pick<PunchItem, 'title' | 'location' | 'notes' | 'status' | 'measurements'>>

/**
 * Everything the screens need from storage. There are two versions:
 * Supabase (real, shared between both workers) and Demo (this device only).
 */
export interface Backend {
  mode: 'supabase' | 'demo'

  getUser(): Promise<AppUser | null>
  onAuthChange(callback: (user: AppUser | null) => void): () => void
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  updateMyName(name: string): Promise<void>

  listJobs(): Promise<JobSummary[]>
  getJob(id: string): Promise<Job>
  createJob(input: JobInput): Promise<Job>
  updateJob(id: string, input: JobInput): Promise<Job>
  deleteJob(id: string): Promise<void>

  listItems(jobId: string): Promise<PunchItem[]>
  getItem(id: string): Promise<PunchItem>
  createItem(jobId: string, title: string, location: string): Promise<PunchItem>
  updateItem(id: string, patch: ItemPatch): Promise<PunchItem>
  deleteItem(id: string): Promise<void>

  listPhotos(itemId: string): Promise<Photo[]>
  addPhoto(itemId: string, kind: PhotoKind, image: Blob): Promise<Photo>
  deletePhoto(photo: Photo): Promise<void>
}
