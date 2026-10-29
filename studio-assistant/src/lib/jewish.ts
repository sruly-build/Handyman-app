import { HDate, HebrewCalendar, flags } from '@hebcal/core'
import { iso, parse } from './dates'

export type HolidayKind = 'yomtov' | 'cholhamoed' | 'fast' | 'erev' | 'minor' | 'roshchodesh'

export interface Holiday {
  date: string
  name: string
  kind: HolidayKind
}

const SKIP = new Set(['Chag HaBanot', 'Purim Katan', 'Shushan Purim Katan', 'Leil Selichot'])

const cache = new Map<string, Holiday[]>()

function yearHolidays(year: number, israel: boolean): Holiday[] {
  const key = `${year}-${israel}`
  const hit = cache.get(key)
  if (hit) return hit
  const events = HebrewCalendar.calendar({
    start: new Date(year, 0, 1),
    end: new Date(year, 11, 31),
    il: israel,
    noModern: true,
    noSpecialShabbat: true,
  })
  const out: Holiday[] = []
  for (const ev of events) {
    const f = ev.getFlags()
    const name = ev.render('en')
    if (SKIP.has(ev.getDesc())) continue
    let kind: HolidayKind | null = null
    if (f & flags.CHOL_HAMOED) kind = 'cholhamoed'
    else if (f & flags.CHAG) kind = 'yomtov'
    else if (f & (flags.MAJOR_FAST | flags.MINOR_FAST)) kind = 'fast'
    else if (f & flags.EREV) kind = 'erev'
    else if (f & (flags.MINOR_HOLIDAY | flags.CHANUKAH_CANDLES)) kind = 'minor'
    else if (f & flags.ROSH_CHODESH) kind = 'roshchodesh'
    if (!kind) continue
    out.push({ date: iso(ev.getDate().greg()), name: tidy(name), kind })
  }
  cache.set(key, out)
  return out
}

function tidy(name: string): string {
  return name.replace(/’’/g, '"').replace(/’/g, "'").replace(/\s+\d{4}$/, '')
}

export function holidaysOn(date: string, israel = false): Holiday[] {
  const year = parse(date).getFullYear()
  return yearHolidays(year, israel).filter((h) => h.date === date)
}

/** Holidays worth a heads-up before scheduling (everything but Rosh Chodesh). */
export function blockingHoliday(date: string, israel = false): Holiday | undefined {
  const order: HolidayKind[] = ['yomtov', 'cholhamoed', 'fast', 'erev', 'minor']
  const list = holidaysOn(date, israel).filter((h) => h.kind !== 'roshchodesh')
  return list.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0]
}

export function hebrewDate(date: string): { day: number; month: string; year: number; full: string; hebrew: string } {
  const h = new HDate(parse(date))
  return {
    day: h.getDate(),
    month: h.getMonthName().replace(/’/g, "'"),
    year: h.getFullYear(),
    full: `${h.getDate()} ${h.getMonthName().replace(/’/g, "'")} ${h.getFullYear()}`,
    hebrew: h.renderGematriya(true),
  }
}

/** Plain-language name of the holiday, for heads-ups ("This is Sukkot"). */
export function holidayShortName(h: Holiday): string {
  return h.name
    .replace(/\s+(I|II|III|IV|V|VI|VII|VIII)\b.*$/, '')
    .replace(/:\s*\d+\s*Candles?$/, '')
    .replace(/:\s*8th Day$/, '')
}

export const KIND_STYLE: Record<HolidayKind, { dot: string; chip: string; label: string }> = {
  yomtov: { dot: 'bg-purple', chip: 'bg-purple-soft text-purple', label: 'Yom Tov' },
  cholhamoed: { dot: 'bg-purple/50', chip: 'bg-purple-soft text-purple', label: 'Chol Hamoed' },
  fast: { dot: 'bg-ink-2', chip: 'bg-fill text-ink-2', label: 'Fast day' },
  erev: { dot: 'bg-gold', chip: 'bg-gold-soft text-gold', label: 'Erev Yom Tov' },
  minor: { dot: 'bg-gold', chip: 'bg-gold-soft text-gold', label: 'Holiday' },
  roshchodesh: { dot: 'bg-ink-3', chip: 'bg-fill text-ink-2', label: 'Rosh Chodesh' },
}
