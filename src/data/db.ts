import type { AppUser } from './types'

export type Table =
  | 'sales_orgs'
  | 'prospects'
  | 'sales_activities'
  | 'follow_ups'
  | 'properties'
  | 'units'
  | 'service_settings'
  | 'landlords'
  | 'tenants'
  | 'property_claims'
  | 'memberships'
  | 'hour_credits'
  | 'service_requests'
  | 'request_photos'
  | 'approvals'
  | 'property_items'
  | 'inspections'
  | 'property_photos'
  | 'guides'
  | 'push_subscriptions'
  | 'inbound_messages'
  | 'item_assignments'
  | 'contacts'
  | 'directory_shares'
  | 'companies'
  | 'company_invites'
  | 'job_shares'
  | 'profiles'
  | 'settings'
  | 'jobs'
  | 'punch_items'
  | 'photos'
  | 'parts'
  | 'bring_checks'
  | 'time_entries'
  | 'invoices'
  | 'job_charges'
  | 'price_list'
  | 'payments'

export type Bucket = 'photos' | 'requests' | 'house'

export type Where = Record<string, string | number | boolean>

export interface SelectOptions {
  /** Only rows where this column is empty (e.g. timers still running) */
  isNull?: string
}

/**
 * The basic storage operations. There are two versions: Supabase (real,
 * shared between both workers) and Demo (saved on this device only).
 * Everything the app does is built on top of these in api.ts.
 */
export interface Db {
  mode: 'supabase' | 'demo'
  select<T>(table: Table, where?: Where, options?: SelectOptions): Promise<T[]>
  insert<T extends { id: string }>(table: Table, row: T): Promise<T>
  update<T>(table: Table, id: string, patch: Partial<T>): Promise<T>
  upsert<T extends { id: string }>(table: Table, row: T): Promise<T>
  /** Change the one row matching `where` (for tables keyed by something other than id) */
  updateWhere<T>(table: Table, where: Where, patch: Partial<T>): Promise<T>
  remove(table: Table, where: Where): Promise<void>
  /** Run one of the database's own functions (e.g. share_job) */
  rpc<T>(fn: string, args: Record<string, unknown>): Promise<T>

  /** Files go in the 'photos' bucket unless another is named ('requests', 'house') */
  upload(path: string, file: Blob, bucket?: Bucket): Promise<void>
  fileUrls(paths: string[], bucket?: Bucket): Promise<string[]>
  removeFiles(paths: string[], bucket?: Bucket): Promise<void>
}

export interface SignUpInput {
  email: string
  password: string
  fullName: string
  companyName: string
}

export interface Auth {
  getUser(): Promise<AppUser | null>
  onAuthChange(callback: (user: AppUser | null) => void): () => void
  /** Called when someone opens a "reset password" link from their email */
  onPasswordRecovery(callback: () => void): () => void
  /** Ask listeners to reload the user (e.g. after a name change) */
  refresh(): Promise<void>
  signIn(email: string, password: string): Promise<void>
  /** Returns true when the person must confirm their email before logging in */
  signUp(input: SignUpInput): Promise<{ needsConfirmation: boolean }>
  sendPasswordReset(email: string): Promise<void>
  updatePassword(password: string): Promise<void>
  signOut(): Promise<void>
  /** The login token, for calls to the app's own server (empty in Demo mode) */
  accessToken(): Promise<string>
}
