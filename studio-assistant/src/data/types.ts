export type Stage = 'todo' | 'progress' | 'revisions' | 'done'
export const STAGES: Stage[] = ['todo', 'progress', 'revisions', 'done']

export type Priority = 'high' | 'normal'

export interface Client {
  id: string
  name: string
  company: string
  email: string
  phone: string
  address: string
  notes: string
  since: string
}

export type LeadStatus = 'new' | 'contacted' | 'quoted' | 'booked'
export const LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'quoted', 'booked']

export interface Lead {
  id: string
  name: string
  company: string
  email: string
  phone: string
  source: string
  status: LeadStatus
  note: string
  value: number
  createdAt: string
  emailId?: string
  convertedProjectId?: string
}

export interface SubTask {
  id: string
  title: string
  done: boolean
}

export interface ShotItem {
  id: string
  title: string
  done: boolean
  seconds: number
  due?: string
  assignee?: string
  subtasks: SubTask[]
}

export interface OrderItem {
  id: string
  title: string
  done: boolean
  due?: string
}

export interface ProjectFile {
  id: string
  name: string
  kind: 'pdf' | 'doc' | 'image' | 'sheet' | 'zip'
  size: string
  added: string
  /** Where the file is stored (live mode) */
  path?: string
}

export interface Sticky {
  id: string
  x: number
  y: number
  text: string
  color: 'yellow' | 'blue' | 'pink' | 'green'
}

export interface Stroke {
  id: string
  points: [number, number][]
}

export interface Project {
  id: string
  clientId: string
  title: string
  stage: Stage
  shootDate: string
  shootTime?: string
  dueDate: string
  priority: Priority
  notes: string
  shotList: ShotItem[]
  toOrder: OrderItem[]
  prep: SubTask[]
  files: ProjectFile[]
  stickies: Sticky[]
  strokes: Stroke[]
  galleryId?: string
}

export interface Task {
  id: string
  title: string
  due: string
  done: boolean
  projectId?: string
}

export interface Email {
  id: string
  from: string
  fromEmail: string
  subject: string
  summary: string
  body: string
  receivedAt: number
  isLead: boolean
  clientId?: string
  projectId?: string
  leadId?: string
  archived: boolean
  draft: string
  replied?: boolean
  threadId?: string
  messageId?: string
}

export interface ReachOut {
  id: string
  name: string
  company: string
  email: string
  lastContact: string
  note: string
  draft: string
  status: 'pending' | 'skipped' | 'never' | 'sent'
  /** The day it was suggested */
  day?: string
}

export interface Comment {
  id: string
  who: string
  text: string
  at: number
  fromClient: boolean
}

export type PhotoKind = 'plate' | 'bowl' | 'salad' | 'stack' | 'pasta' | 'mug'

export interface Photo {
  id: string
  name: string
  /** Dropbox path for real photos; sample photos are drawn from kind and colours instead */
  path?: string
  kind?: PhotoKind
  bg?: string
  ware?: string
  accent?: string
  favourite: boolean
  comments: Comment[]
}

export interface Gallery {
  id: string
  projectId: string
  title: string
  dropboxPath: string
  photos: Photo[]
  coverId: string
  lockDownloads: boolean
}

export type BillingMethod = 'items' | 'hourly'
export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'partly paid' | 'paid'
export type PayMethod = 'zelle' | 'check' | 'card'

export interface Line {
  id: string
  desc: string
  qty: number
  price: number
}

export interface Payment {
  id: string
  amount: number
  date: string
  method: PayMethod
  note?: string
}

export interface Invoice {
  id: string
  number: string
  kind: 'estimate' | 'invoice'
  projectId: string
  clientId: string
  method: BillingMethod
  lines: Line[]
  hours: number
  rate: number
  discountType: 'pct' | 'amt'
  discount: number
  depositType: 'pct' | 'amt'
  deposit: number
  cardFee: boolean
  payByCard: boolean
  status: InvoiceStatus
  issued: string
  due: string
  payments: Payment[]
  note: string
  lastReminder?: string
  convertedFrom?: string
}

export interface PriceItem {
  id: string
  name: string
  price: number
  unit: string
}

export interface Settings {
  businessName: string
  owner: string
  email: string
  phone: string
  website: string
  address: string
  logoColor: string
  logoUrl?: string
  zelleName: string
  zelleContact: string
  checkPayee: string
  checkAddress: string
  priceSheet: PriceItem[]
  hourlyRate: number
  cardFeePct: number
  closedWeekdays: number[]
  closedDates: string[]
  openDates: string[]
  israel: boolean
  autoReceipts: boolean
  autoReminders: boolean
  reminderDays: number
}

export interface ActiveTimer {
  projectId: string
  itemId: string
  startedAt: number
}

export interface State {
  seedDay: string
  settings: Settings
  clients: Client[]
  leads: Lead[]
  projects: Project[]
  tasks: Task[]
  emails: Email[]
  reachOuts: ReachOut[]
  galleries: Gallery[]
  invoices: Invoice[]
  timer: ActiveTimer | null
}
