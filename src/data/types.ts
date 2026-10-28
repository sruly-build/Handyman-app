export type ItemStatus = 'todo' | 'in_progress' | 'done'
export type PhotoKind = 'before' | 'after' | 'sketch'
export type PartStatus = 'needed' | 'ordered' | 'received'
export type LabourMode = 'task' | 'visit'

export interface AppUser {
  id: string
  email: string
  name: string
}

export interface Profile {
  id: string
  full_name: string
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
  /** The person who created the job and owns it (null only in Demo mode's old data) */
  created_by: string | null
  /** Ids of the people the owner shared this job with */
  assigned: string[]
  /** Things to bring that aren't tied to a punch list item */
  bring_extras: string[]
  /** This job's own "markup on materials" switch (null = use the setting) */
  markup_parts?: boolean | null
  created_at: string
}

/** A job plus counts, for list screens */
export interface JobSummary extends Job {
  item_count: number
  done_count: number
  in_progress_count: number
  /** People clocked in at this job right now */
  on_site: string[]
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
  /** Tools and materials needed, one per line, e.g. "Drill", "Wall anchors x8" */
  tools: string[]
  /** Expected time for the estimate */
  estimated_hours: number | null
  position: number
  created_at: string
}

export interface PhotoRow {
  id: string
  item_id: string
  kind: PhotoKind
  storage_path: string
  created_at: string
}

export interface Photo extends PhotoRow {
  /** A URL the browser can show directly */
  url: string
}

export interface Part {
  id: string
  job_id: string
  item_id: string | null
  name: string
  quantity: number
  /** Total paid for this line (or expected cost before it's bought) */
  cost: number | null
  supplier: string
  status: PartStatus
  created_at: string
  ordered_at: string | null
  received_at: string | null
}

export interface BringCheck {
  /** `${job_id}:${key}` so the same thing can't be ticked twice */
  id: string
  job_id: string
  key: string
}

export interface TimeEntry {
  id: string
  job_id: string
  item_id: string | null
  user_id: string
  /** visit = arrived → finished at the job; task = timer on one punch list item */
  kind: 'visit' | 'task'
  started_at: string
  ended_at: string | null
}

export interface Settings {
  /** The login id of the person these settings belong to */
  id: string
  business_name: string
  business_phone: string
  business_email: string
  business_address: string
  markup_percent: number
  /** Price of the first hour of a job (null = same as hourly_rate) */
  first_hour_rate: number | null
  /** Hourly rate (after the first hour, if there is a first-hour rate) */
  hourly_rate: number
  /** Add the markup to materials */
  markup_parts: boolean
  markup_labour: boolean
  labour_mode: LabourMode
}

export interface InvoiceLine {
  /** work = a task listed on the invoice without its own labour charge */
  kind: 'labour' | 'part' | 'work'
  description: string
  detail: string
  quantity: number
  amount: number
}

export interface Invoice {
  id: string
  job_id: string
  number: number
  status: 'unpaid' | 'paid'
  created_at: string
  paid_at: string | null
  lines: InvoiceLine[]
  parts_total: number
  labour_total: number
  total: number
  markup_percent: number
}

export type JobInput = Omit<Job, 'id' | 'created_at' | 'created_by'>
export type ItemPatch = Partial<
  Pick<PunchItem, 'title' | 'location' | 'notes' | 'status' | 'measurements' | 'tools' | 'estimated_hours'>
>
export type PartInput = Omit<Part, 'id' | 'created_at' | 'ordered_at' | 'received_at'>
