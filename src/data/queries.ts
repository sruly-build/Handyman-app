import { useQuery, type QueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { backend } from './backend'

/** Cache keys, so a change in one screen refreshes the others */
export const keys = {
  jobs: ['jobs'] as const,
  job: (id: string) => ['job', id] as const,
  items: (jobId: string) => ['items', jobId] as const,
  item: (id: string) => ['item', id] as const,
  photos: (itemId: string) => ['photos', itemId] as const,
  jobPhotos: (jobId: string) => ['photos', 'job', jobId] as const,
  parts: (jobId?: string) => ['parts', jobId ?? 'all'] as const,
  part: (id: string) => ['part', id] as const,
  bring: (jobId: string) => ['bring', jobId] as const,
  time: (jobId: string) => ['time', jobId] as const,
  myTime: ['myTime'] as const,
  running: ['running'] as const,
  people: ['people'] as const,
  settings: ['settings'] as const,
  company: (id?: string | null) => ['company', id ?? 'mine'] as const,
  shares: (jobId: string) => ['shares', jobId] as const,
  invoice: (jobId: string) => ['invoice', jobId] as const,
}

/**
 * After any change, reload everything on screen. Photos are left alone
 * (their links would change and make the pictures flash); photo changes
 * refresh them with `refreshPhotos`.
 */
export function refreshAll(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'photos' })
}

export function refreshPhotos(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: ['photos'] })
}

export const useJobs = () => useQuery({ queryKey: keys.jobs, queryFn: () => backend.listJobs() })
export const useLeads = () => useQuery({ queryKey: ['leads'], queryFn: () => backend.listLeads() })
/** Jobs and leads together, for the schedule */
export const useSchedule = () => useQuery({ queryKey: ['schedule'], queryFn: () => backend.listJobsAndLeads() })
export const useJob = (id: string, enabled = true) =>
  useQuery({ queryKey: keys.job(id), queryFn: () => backend.getJob(id), enabled })
export const useItems = (jobId: string) => useQuery({ queryKey: keys.items(jobId), queryFn: () => backend.listItems(jobId) })
export const useAllItems = () => useQuery({ queryKey: ['items', 'all'], queryFn: () => backend.listAllItems() })
export const useItem = (id: string) => useQuery({ queryKey: keys.item(id), queryFn: () => backend.getItem(id) })
export const usePhotos = (itemId: string) =>
  useQuery({ queryKey: keys.photos(itemId), queryFn: () => backend.listPhotos(itemId) })
export const useJobPhotos = (jobId: string) =>
  useQuery({ queryKey: keys.jobPhotos(jobId), queryFn: () => backend.listJobPhotos(jobId) })
/** shared: another company's job (parts without their cost) */
export const useParts = (jobId?: string, shared = false, enabled = true) =>
  useQuery({ queryKey: keys.parts(jobId), queryFn: () => backend.listParts(jobId, shared), enabled })
export const usePart = (id: string, enabled = true) =>
  useQuery({ queryKey: keys.part(id), queryFn: () => backend.getPart(id), enabled })
export const useBringChecks = (jobId: string) =>
  useQuery({ queryKey: keys.bring(jobId), queryFn: () => backend.listBringChecks(jobId) })
export const useAllBringChecks = () => useQuery({ queryKey: ['bring', 'all'], queryFn: () => backend.listAllBringChecks() })
export const useTime = (jobId: string) => useQuery({ queryKey: keys.time(jobId), queryFn: () => backend.listTime(jobId) })
export const useMyTime = () => useQuery({ queryKey: keys.myTime, queryFn: () => backend.listMyTime() })
export const useRunning = () => useQuery({ queryKey: keys.running, queryFn: () => backend.myRunning() })
export const usePeople = () => useQuery({ queryKey: keys.people, queryFn: () => backend.listPeople(), staleTime: 300_000 })
/** My company's prices */
export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => backend.getSettings() })
/** A company's business profile (mine if no id is given) */
export const useCompany = (id?: string | null, enabled = true) =>
  useQuery({ queryKey: keys.company(id), queryFn: () => backend.getCompany(id), enabled })
export const useApprovals = () => useQuery({ queryKey: ['approvals'], queryFn: () => backend.listApprovals() })
export const useCompanies = () => useQuery({ queryKey: ['companies'], queryFn: () => backend.listCompanies() })
export const useShares = (jobId: string, enabled = true) =>
  useQuery({ queryKey: keys.shares(jobId), queryFn: () => backend.listShares(jobId), enabled })
/** On another company's job: what they shared with us */
export const useMyShare = (jobId: string, enabled = true) =>
  useQuery({ queryKey: ['myShare', jobId], queryFn: () => backend.myShare(jobId), enabled })
export const useCharges = (jobId: string) =>
  useQuery({ queryKey: ['charges', jobId], queryFn: () => backend.listCharges(jobId) })
export const usePriceList = () => useQuery({ queryKey: ['priceList'], queryFn: () => backend.listPriceList() })
export const usePayments = (jobId: string) =>
  useQuery({ queryKey: ['payments', jobId], queryFn: () => backend.listPayments(jobId) })
export const useClientJobs = (clientId: string, enabled = true) =>
  useQuery({ queryKey: ['clientJobs', clientId], queryFn: () => backend.listClientJobs(clientId), enabled })
export const useAssignments = (jobId: string, enabled = true) =>
  useQuery({ queryKey: ['assignments', jobId], queryFn: () => backend.listAssignments(jobId), enabled })
export const useVendorWork = (contactId: string, enabled = true) =>
  useQuery({ queryKey: ['vendorWork', contactId], queryFn: () => backend.listVendorWork(contactId), enabled })
export const useProspects = () => useQuery({ queryKey: ['prospects'], queryFn: () => backend.listProspects() })
export const useSalesOrgs = () => useQuery({ queryKey: ['salesOrgs'], queryFn: () => backend.listSalesOrgs() })
export const useActivities = (prospectId: string) =>
  useQuery({ queryKey: ['activities', prospectId], queryFn: () => backend.listActivities(prospectId) })
export const useProperties = (prospectId: string) =>
  useQuery({ queryKey: ['properties', prospectId], queryFn: () => backend.listProperties(prospectId) })
export const useOpportunities = (prospectId: string) =>
  useQuery({ queryKey: ['opportunities', prospectId], queryFn: () => backend.listOpportunities(prospectId) })
export const useMeetings = () => useQuery({ queryKey: ['meetings'], queryFn: () => backend.listMeetings() })
export const useContacts = () => useQuery({ queryKey: ['contacts'], queryFn: () => backend.listContacts() })
export const useDirectoryShares = () =>
  useQuery({ queryKey: ['directoryShares'], queryFn: () => backend.listDirectoryShares() })
export const useSharedDirectories = () =>
  useQuery({ queryKey: ['sharedDirectories'], queryFn: () => backend.listSharedDirectories() })
export const useInvoice = (jobId: string) =>
  useQuery({ queryKey: keys.invoice(jobId), queryFn: () => backend.getInvoice(jobId) })

/** Map of person id → first name, for showing who did what */
export function usePeopleNames(): (id: string) => string {
  const { data = [] } = usePeople()
  return (id) => data.find((p) => p.id === id)?.full_name || 'Someone'
}

/** Current time, ticking every `ms` milliseconds (for running timers) */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(t)
  }, [ms])
  return now
}

// Request Inbox & Landlord Maintenance Plan
export const useServiceSettings = () =>
  useQuery({ queryKey: ['serviceSettings'], queryFn: () => backend.getServiceSettings() })
export const useRequests = () => useQuery({ queryKey: ['requests'], queryFn: () => backend.listRequests() })
export const useRequestPhotos = (id: string) =>
  useQuery({ queryKey: ['photos', 'request', id], queryFn: () => backend.requestPhotos(id) })
export const useHouses = () => useQuery({ queryKey: ['houses'], queryFn: () => backend.listHouses() })
export const useHouse = (id: string) =>
  useQuery({ queryKey: ['house', id], queryFn: () => backend.getHouse(id), enabled: Boolean(id) })
export const useGuides = () => useQuery({ queryKey: ['guides'], queryFn: () => backend.listGuides() })
export const useRequestApprovals = (requestId: string) =>
  useQuery({ queryKey: ['requestApprovals', requestId], queryFn: () => backend.listRequestApprovals(requestId) })
export const useHouseLandlord = (propertyId: string | null) =>
  useQuery({ queryKey: ['houseLandlord', propertyId], queryFn: () => backend.houseLandlord(propertyId) })
export const useLandlords = () => useQuery({ queryKey: ['landlords'], queryFn: () => backend.listLandlords() })
export const useClaims = () => useQuery({ queryKey: ['claims'], queryFn: () => backend.listClaims() })
export const useHours = (propertyId: string | null) =>
  useQuery({ queryKey: ['hours', propertyId], queryFn: () => backend.listHours(propertyId!), enabled: Boolean(propertyId) })
export const useJobApprovals = (jobId: string) =>
  useQuery({ queryKey: ['jobApprovals', jobId], queryFn: () => backend.listJobApprovals(jobId) })
