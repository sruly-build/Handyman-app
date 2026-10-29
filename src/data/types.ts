export type ItemStatus = 'todo' | 'in_progress' | 'done'
export type PhotoKind = 'before' | 'after' | 'sketch'
export type PartStatus = 'needed' | 'ordered' | 'received'
export type LabourMode = 'task' | 'visit'

export type Role = 'owner' | 'member'

export interface AppUser {
  id: string
  email: string
  name: string
  companyId: string
  /** owner runs the company (profile, prices, team); member works jobs */
  role: Role
  /** The app's admin approves who may sign up and start a new company */
  isAdmin: boolean
}

export interface Profile {
  id: string
  full_name: string
  company_id: string | null
  role: Role
}

/** A company's business profile, printed on its estimates and invoices */
export interface Company {
  id: string
  name: string
  email: string
  phone: string
  address: string
}

/** A job one company shared with another (punch list and photos only) */
/** What a company sees on a job shared with it, besides the punch list and photos */
export interface ShareOptions {
  share_parts: boolean
  share_bring: boolean
  share_time: boolean
}

export interface JobShare extends ShareOptions {
  job_id: string
  company_id: string
  /** Filled in by the app for display */
  company_name?: string
}

/** An email approved to sign up: to join a team (company_id) or start a new company (null) */
export interface Invite {
  email: string
  company_id: string | null
  created_at: string
}

/** Whether an email may sign up: start a company, join a team, already has an account, or not approved */
export type SignupStatus = 'company' | 'team' | 'exists' | 'none'

export interface Job {
  id: string
  customer_name: string
  customer_phone: string
  customer_email: string
  address: string
  /** Calendar date as YYYY-MM-DD, or null if not booked yet */
  job_date: string | null
  notes: string
  /** The company the job belongs to (null only in Demo mode's old data) */
  company_id: string | null
  /** The person who created the job */
  created_by: string | null
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
  /** Another company's job shared with us: that company's name. Null for our own jobs. */
  from_company: string | null
  /** Our own job: names of the companies we shared it with */
  shared_with: string[]
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
  /** `${company}:${job_id}:${key}` (older ticks: `${job_id}:${key}`) */
  id: string
  job_id: string
  key: string
  /** Each company ticks its own list */
  company_id?: string
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

/** A company's prices */
export interface Settings {
  /** The company these prices belong to */
  id: string
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
  /** work = a task listed without its own charge; extra = a line item typed in by hand */
  kind: 'labour' | 'part' | 'work' | 'extra'
  description: string
  detail: string
  quantity: number
  amount: number
  /** For extra lines: the job charge it came from, so it can be removed again */
  charge_id?: string
}

/** A line item typed in by hand on a job (trip charge, disposal fee, add-on). No markup. */
export interface JobCharge {
  id: string
  job_id: string
  description: string
  quantity: number
  unit_price: number
  created_at: string
}

/** A company's saved price for something it charges for often */
export interface PriceItem {
  id: string
  company_id: string
  name: string
  price: number
  created_at: string
}

export type PaymentMethod = 'cash' | 'check' | 'card' | 'transfer' | 'other'

/** Money received for a job: a deposit or a partial or full payment */
export interface Payment {
  id: string
  job_id: string
  amount: number
  /** YYYY-MM-DD */
  paid_on: string
  method: PaymentMethod
  note: string
  created_at: string
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

export type JobInput = Omit<Job, 'id' | 'created_at' | 'created_by' | 'company_id'>
export type ItemPatch = Partial<
  Pick<PunchItem, 'title' | 'location' | 'notes' | 'status' | 'measurements' | 'tools' | 'estimated_hours'>
>
export type PartInput = Omit<Part, 'id' | 'created_at' | 'ordered_at' | 'received_at'>

export type ContactKind = 'client' | 'vendor'

/** Someone in my directory: a client, or a vendor (sub, supplier…) */
export interface Contact {
  id: string
  /** Whose directory it's in (only they can change it) */
  owner_id: string
  kind: ContactKind
  name: string
  business: string
  /** e.g. ["Plumbing", "Heating"] */
  categories: string[]
  phone: string
  email: string
  notes: string
  /** Mostly for clients */
  address: string
  created_at: string
}

export type ContactInput = Pick<
  Contact,
  'kind' | 'name' | 'business' | 'categories' | 'phone' | 'email' | 'notes' | 'address'
>

/** A person who can see my directory, or whose directory I can see */
export interface DirectoryPerson {
  id: string
  name: string
  email?: string
}
