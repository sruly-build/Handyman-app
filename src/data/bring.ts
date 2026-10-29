import type { Part, PunchItem } from './types'

export interface BringEntry {
  /** Stable id used to remember the tick, e.g. "tool:drill" or "part:<id>" */
  key: string
  label: string
  /** Which punch list items need it */
  sources: string[]
  kind: 'tool' | 'part'
}

/** "  Wall  Anchors " and "wall anchors" count as the same thing */
export const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * One checklist for the van: every tool and material from every punch list
 * item (no duplicates), extra things added to the job, and parts that were
 * ordered for the job so they don't get left behind.
 */
export function buildBringList(items: PunchItem[], parts: Part[], extras: string[]): BringEntry[] {
  const tools = new Map<string, BringEntry>()
  const add = (label: string, source: string | null) => {
    const key = `tool:${normalize(label)}`
    if (key === 'tool:') return
    const entry = tools.get(key) ?? { key, label: label.trim(), sources: [], kind: 'tool' as const }
    if (source && !entry.sources.includes(source)) entry.sources.push(source)
    tools.set(key, entry)
  }
  for (const item of items) for (const t of item.tools) add(t, item.title)
  for (const e of extras) add(e, null)

  const titleOf = new Map(items.map((i) => [i.id, i.title]))
  const partEntries: BringEntry[] = parts
    .filter((p) => p.status !== 'needed' && !p.vendor_orders)
    .map((p) => ({
      key: `part:${p.id}`,
      label: p.quantity > 1 ? `${p.name} × ${p.quantity}` : p.name,
      sources: p.item_id && titleOf.has(p.item_id) ? [titleOf.get(p.item_id)!] : [],
      kind: 'part',
    }))

  const byLabel = (a: BringEntry, b: BringEntry) => a.label.localeCompare(b.label)
  return [...[...tools.values()].sort(byLabel), ...partEntries.sort(byLabel)]
}
