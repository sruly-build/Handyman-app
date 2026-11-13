import type { InspectionResult, ServiceSettings } from './types'

/** The first-visit (intake) checklist, room by room. Photograph each room, including model stickers. */
export const intakeRooms: { room: string; items: string[] }[] = [
  { room: 'Kitchen', items: ['Sink and faucet', 'Under the sink (leaks)', 'Stove / oven', 'Fridge', 'Dishwasher', 'Cabinets and drawers', 'Outlets and GFCI', 'Floor'] },
  { room: 'Bathroom', items: ['Toilet', 'Sink and faucet', 'Tub / shower and caulk', 'Exhaust fan', 'Outlets and GFCI', 'Floor'] },
  { room: 'Bedrooms', items: ['Doors and locks', 'Windows', 'Outlets and switches', 'Smoke detector', 'Walls and floor'] },
  { room: 'Living areas', items: ['Doors', 'Windows', 'Outlets and switches', 'Walls and floor'] },
  { room: 'Laundry', items: ['Washer hookups', 'Dryer vent'] },
  { room: 'Systems', items: ['Furnace / boiler', 'Air conditioning', 'HVAC filter', 'Water heater', 'Breaker panel', 'Main water shut-off', 'Smoke and CO detectors'] },
  { room: 'Outside', items: ['Gutters and downspouts', 'Steps and railings', 'Outside faucets', 'Entry doors and locks'] },
]

export function startResults(kind: 'intake' | 'inspection' | 'winter' | 'spring', settings?: Pick<ServiceSettings, 'seasonal_checklists'>): InspectionResult[] {
  if (kind === 'winter' || kind === 'spring') {
    const list = settings?.seasonal_checklists[kind] ?? []
    return list.map((label) => ({ room: kind === 'winter' ? 'Before winter' : 'Before spring', label, rating: null, note: '', item_id: null }))
  }
  return intakeRooms.flatMap((r) => r.items.map((label) => ({ room: r.room, label, rating: null, note: '', item_id: null })))
}

/** Which seasonal check-up is coming up: before winter (Sep–Nov) or before spring (Feb–Apr) */
export function seasonDue(now = new Date()): 'winter' | 'spring' | null {
  const m = now.getMonth()
  if (m >= 8 && m <= 10) return 'winter'
  if (m >= 1 && m <= 3) return 'spring'
  return null
}
