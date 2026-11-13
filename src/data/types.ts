export type ItemStatus = 'todo' | 'in_progress' | 'done'
export type PhotoKind = 'before' | 'after' | 'sketch'
export type PartStatus = 'needed' | 'ordered' | 'received'
export type LabourMode = 'task' | 'visit'

export type Role = 'owner' | 'member' | 'landlord'

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
  /** The client in the directory (filled in automatically when the job is saved) */
  client_id?: string | null
  /** 'lead' until it's converted into a job (missing = job, for older data) */
  stage?: JobStage
  /** Only for leads */
  lead_status?: LeadStatus | null
  /** Booked walkthrough (date and time), for leads */
  walkthrough_at?: string | null
  /** When the lead was won or lost */
  lead_closed_at?: string | null
  /** Optional start time on job_date, "HH:MM" (the database may add ":SS") */
  job_time?: string | null
  /** Turnover opportunities: the sales lead, property and unit, and the dates */
  prospect_id?: string | null
  property_id?: string | null
  unit_id?: string | null
  move_out_date?: string | null
  ready_by_date?: string | null
  created_at: string
}

export type JobStage = 'lead' | 'job'
export type LeadStatus = 'new' | 'walkthrough_booked' | 'estimate_sent' | 'won' | 'lost'

/** What's needed to start a lead */
export type LeadInput = Pick<Job, 'customer_name' | 'customer_phone' | 'address' | 'notes'> & {
  client_id?: string | null
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
  /** On a vendor's item: the vendor orders it (off my orders list and my bill) */
  vendor_orders?: boolean
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
  /**
   * work = a task listed without its own charge; extra = a line item typed in by hand;
   * vendor = a task a vendor did, at the vendor's price (plus markup if chosen)
   */
  kind: 'labour' | 'part' | 'work' | 'extra' | 'vendor'
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

/** Who buys an item's materials, and who pays its vendor */
export type MaterialsBy = 'me' | 'vendor'
export type VendorPaidBy = 'me' | 'client'

/** A punch list item someone else is doing (company only, never shared) */
export interface ItemAssignment {
  /** The punch list item's id */
  id: string
  job_id: string
  /** The vendor in my directory (null if it was deleted; the name stays) */
  contact_id: string | null
  name: string
  /** What the vendor charges me for the labour. Private: never on the client's invoice. */
  price: number | null
  materials_by: MaterialsBy
  paid_by: VendorPaidBy
  /** Add my markup to the vendor's price on the client's bill */
  markup: boolean
  /** Have I paid the vendor */
  vendor_paid: boolean
  vendor_paid_at: string | null
  created_at: string
}

export type AssignmentInput = Pick<
  ItemAssignment,
  'contact_id' | 'name' | 'price' | 'materials_by' | 'paid_by' | 'markup' | 'vendor_paid'
>

/** One item I gave a vendor, for their history */
export interface VendorWork {
  assignment: ItemAssignment
  item: Pick<PunchItem, 'id' | 'title' | 'status' | 'location'> | null
  job: Pick<Job, 'id' | 'customer_name' | 'job_date' | 'address' | 'stage'> | null
}

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
  /** Set on customers shared with the whole company (converted from sales); null = private */
  company_id?: string | null
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

/** One past or current job, for a client's history */
export interface ClientJob {
  job: Job
  items: Pick<PunchItem, 'id' | 'title' | 'status'>[]
  invoice: Invoice | null
  paid: number
}

// ---- Sales & Leads ----

export type ProspectStage =
  | 'new'
  | 'contacted'
  | 'follow_up'
  | 'interested'
  | 'meeting'
  | 'proposal'
  | 'converted'
  | 'not_interested'
export type OrgType = 'landlord' | 'property_manager' | 'investor' | 'apartment_owner' | 'other'
export type Interest = 'unknown' | 'low' | 'medium' | 'high'
export type CallOutcome = 'no_answer' | 'voicemail' | 'call_back' | 'interested' | 'meeting' | 'not_interested'

/** A landlord or management company (one company, many contacts) */
export interface SalesOrg {
  id: string
  company_id: string
  name: string
  org_type: OrgType
  service_area: string
  units_estimate: number | null
  created_at: string
}

/** A sales lead: a person we're contacting about turnover work */
export interface Prospect {
  id: string
  company_id: string
  org_id: string | null
  name: string
  phone: string
  email: string
  /** Partners (people in my company) who know them */
  known_by: string[]
  mutual: boolean
  cold: boolean
  how_known: string
  assigned_to: string | null
  stage: ProspectStage
  interest: Interest
  notes: string
  project_notes: string
  last_contacted_at: string | null
  last_contacted_by: string | null
  archived_at: string | null
  /** The directory client, once converted */
  client_id: string | null
  source: string
  created_by: string | null
  created_at: string
}

/** The next call or meeting with a lead (only one open at a time) */
export interface FollowUp {
  id: string
  company_id: string
  prospect_id: string
  kind: 'call' | 'meeting'
  due_at: string
  note: string
  location: string
  done_at: string | null
  done_by: string | null
  created_by: string | null
  created_at: string
}

/** A lead with its company and its open follow-up */
export interface ProspectView extends Prospect {
  org: SalesOrg | null
  follow_up: FollowUp | null
}

export interface SalesActivity {
  id: string
  company_id: string
  prospect_id: string
  kind: 'created' | 'call' | 'note' | 'stage' | 'follow_up' | 'converted'
  outcome: CallOutcome | null
  channel: string
  note: string
  by_user: string | null
  created_at: string
}

export interface Property {
  id: string
  company_id: string
  org_id: string | null
  prospect_id: string | null
  client_id: string | null
  address: string
  notes: string
  created_at: string
  // House profile and plan (Request Inbox)
  address_key?: string | null
  lat?: number | null
  lng?: number | null
  landlord_id?: string | null
  source?: 'owner' | 'request' | 'landlord'
  water_shutoff?: string
  breaker_panel?: string
  paint_colors?: string
  filter_type?: string
  filter_size?: string
  filter_months?: number | null
  last_filter_at?: string | null
  intake_done_at?: string | null
}

export interface Unit {
  id: string
  company_id: string
  property_id: string
  label: string
  notes?: string
  created_at: string
}

/** What the lead form edits (the company details go to its sales_org) */
export type ProspectInput = Pick<
  Prospect,
  'name' | 'phone' | 'email' | 'known_by' | 'mutual' | 'cold' | 'how_known' | 'assigned_to' | 'stage' | 'interest' | 'notes' | 'project_notes'
> & {
  org_name: string
  org_type: OrgType
  service_area: string
  units_estimate: number | null
}

/** A new follow-up: when, and what to remember */
export interface FollowUpInput {
  kind: 'call' | 'meeting'
  due_at: string
  note: string
  location?: string
}

// ---------------------------------------------------------------
// Request Inbox & Landlord Maintenance Plan
// ---------------------------------------------------------------
export type Urgency = 'emergency' | 'soon' | 'whenever'
export type RequestStatus = 'new' | 'scheduled' | 'done' | 'closed'
export type RequestSource = 'web' | 'text' | 'owner' | 'landlord'

export interface PlanTier {
  id: string
  name: string
  price: number | null
  hours: number
  every_months: number
  cap: number
  expire_months: number
  active: boolean
  services: string[]
}

export interface ServiceSettings {
  company_id: string
  public_slug: string | null
  emergency_fee: number
  filter_months: number
  repeat_threshold: number
  nearby_miles: number
  parts_auto_approve: number
  review_url: string
  whatsapp: string
  emergency_phone: string
  plan_tiers: PlanTier[]
  addons: { name: string; price: number | null }[]
  turnover_checklist: string[]
  seasonal_checklists: { winter: string[]; spring: string[] }
  updated_at: string
}

export interface Landlord {
  id: string
  company_id: string
  user_id: string | null
  client_id: string | null
  name: string
  email: string
  phone: string
  auto_approve_limit: number | null
  notify_new_request: boolean
  notify_done: boolean
  stripe_customer_id: string | null
  referral_code: string
  referred_by: string | null
  referral_rewarded_at: string | null
  created_at: string
}

export interface Tenant {
  id: string
  company_id: string
  property_id: string
  unit_id: string | null
  name: string
  phone: string
  phone_key?: string
  email: string
  active: boolean
  created_at: string
}

export interface PropertyClaim {
  id: string
  company_id: string
  landlord_id: string
  property_id: string
  status: 'pending' | 'approved' | 'declined'
  decided_at: string | null
  created_at: string
}

export interface Membership {
  id: string
  company_id: string
  property_id: string
  landlord_id: string | null
  tier: string
  price: number
  hours_each: number
  every_months: number
  hour_cap: number
  expire_months: number
  status: 'pending' | 'active' | 'past_due' | 'cancelled'
  stripe_subscription_id: string | null
  started_at: string | null
  next_hour_at: string | null
  current_period_end: string | null
  cancelled_at: string | null
  created_at: string
}

export interface HourCredit {
  id: string
  company_id: string
  membership_id: string | null
  property_id: string
  kind: 'plan' | 'referral' | 'manual'
  added_at: string
  expires_at: string
  used_at: string | null
  job_id: string | null
  request_id: string | null
  note: string
}

export interface RequestIssue {
  /** A quick pick (e.g. "unclog") or "other" for a custom issue */
  key: string
  label: string
  /** The custom issue, in their words */
  text: string
  /** What they already tried in the troubleshooting guide */
  tried: string[]
}

export interface ServiceRequest {
  id: string
  company_id: string
  property_id: string | null
  unit_id: string | null
  address: string
  unit_label: string
  lat: number | null
  lng: number | null
  source: RequestSource
  is_member: boolean
  requester_name: string
  requester_phone: string
  requester_email: string
  requester_kind: 'tenant' | 'landlord' | 'other'
  tenant_id: string | null
  verified: boolean
  issues: RequestIssue[]
  description: string
  original_text: string
  language: string
  urgency: Urgency
  tenant_urgency: Urgency
  best_days: string[]
  best_hours: string
  punch_list: string
  status: RequestStatus
  scheduled_at: string | null
  done_at: string | null
  job_id: string | null
  needs_approval: boolean
  photo_needed: boolean
  address_needed: boolean
  over_hour: boolean
  status_token: string
  notified_at: string | null
  feedback: 'up' | 'down' | null
  feedback_note: string
  feedback_at: string | null
  created_at: string
  updated_at: string
}

export interface RequestPhoto {
  id: string
  company_id: string
  request_id: string
  path: string
  kind: 'issue' | 'sticker' | 'list'
  issue_index: number | null
  created_at: string
}

export interface Approval {
  id: string
  company_id: string
  request_id: string | null
  job_id: string | null
  property_id: string | null
  landlord_id: string | null
  kind: 'repair' | 'parts'
  title: string
  details: string
  estimate_hours: number | null
  estimate_amount: number | null
  parts: { name: string; qty: number; price: number }[]
  token: string
  status: 'pending' | 'approved' | 'declined' | 'cancelled'
  auto: boolean
  decided_at: string | null
  decision_note: string
  charge_status: 'none' | 'pending' | 'charged' | 'failed'
  stripe_payment_intent: string | null
  charged_at: string | null
  expires_at: string
  created_by: string | null
  created_at: string
}

export type Condition = 'good' | 'fair' | 'worn'

export interface PropertyItem {
  id: string
  company_id: string
  property_id: string
  unit_id: string | null
  room: string
  kind: 'appliance' | 'fixture' | 'filter' | 'system' | 'other'
  name: string
  brand: string
  model: string
  serial: string
  notes: string
  condition: Condition | null
  replace_soon: boolean
  worn_note: string
  created_at: string
  updated_at: string
}

export interface InspectionResult {
  room: string
  label: string
  rating: Condition | null
  note: string
  item_id: string | null
}

export interface Inspection {
  id: string
  company_id: string
  property_id: string
  unit_id: string | null
  kind: 'intake' | 'inspection' | 'winter' | 'spring'
  results: InspectionResult[]
  summary: string
  done_at: string | null
  shared: boolean
  by_user: string | null
  created_at: string
}

export interface PropertyPhoto {
  id: string
  company_id: string
  property_id: string
  item_id: string | null
  inspection_id: string | null
  room: string
  path: string
  kind: 'room' | 'sticker' | 'worn' | 'inspection'
  created_at: string
}

export type Localized = { en: string; he?: string }

export interface GuideStep {
  /** A safe check to try, e.g. "Is the breaker for the stove on?" */
  q: Localized
  /** Optional extra help shown under the question */
  tip?: Localized
}

export interface Guide {
  id: string
  company_id: string
  issue_key: string
  title: Localized
  steps: GuideStep[]
  published: boolean
  updated_at: string
}

export interface InboundMessage {
  id: string
  company_id: string
  from_phone: string
  body: string
  photo_count: number
  verdict: 'new' | 'request' | 'ignored' | 'error'
  reason: string
  request_id: string | null
  received_at: string
}
