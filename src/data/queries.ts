import { useQuery } from '@tanstack/react-query'
import { backend } from './backend'

/** Cache keys, so a change in one screen refreshes the others */
export const keys = {
  jobs: ['jobs'] as const,
  job: (id: string) => ['job', id] as const,
  items: (jobId: string) => ['items', jobId] as const,
  item: (id: string) => ['item', id] as const,
  photos: (itemId: string) => ['photos', itemId] as const,
}

export const useJobs = () => useQuery({ queryKey: keys.jobs, queryFn: backend.listJobs })
export const useJob = (id: string, enabled = true) =>
  useQuery({ queryKey: keys.job(id), queryFn: () => backend.getJob(id), enabled })
export const useItems = (jobId: string) => useQuery({ queryKey: keys.items(jobId), queryFn: () => backend.listItems(jobId) })
export const useItem = (id: string) => useQuery({ queryKey: keys.item(id), queryFn: () => backend.getItem(id) })
export const usePhotos = (itemId: string) =>
  useQuery({ queryKey: keys.photos(itemId), queryFn: () => backend.listPhotos(itemId) })
