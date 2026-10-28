import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { makeSample } from './sample'
import { today, parse } from '../lib/dates'
import { blockingHoliday, holidayShortName, holidaysOn, type Holiday } from '../lib/jewish'
import type { Project, Settings, ShotItem, State } from './types'

const KEY = 'studio-assistant-preview-v1'

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as State
      // Sample dates are relative to the day it was made; start fresh each new day
      if (s.seedDay === today()) return s
    }
  } catch {
    // Private mode or bad data: fall back to fresh sample data
  }
  return makeSample()
}

interface Toast {
  id: number
  text: string
}

interface Store {
  state: State
  update: (fn: (draft: State) => void) => void
  reset: () => void
  toast: (text: string) => void
  toasts: Toast[]
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(load)
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // Storage full or blocked; the preview still works for this visit
    }
  }, [state])

  const update = useCallback((fn: (draft: State) => void) => {
    setState((s) => {
      const next = structuredClone(s)
      fn(next)
      return next
    })
  }, [])

  const toast = useCallback((text: string) => {
    const id = ++seq.current
    setToasts((t) => [...t, { id, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600)
  }, [])

  const reset = useCallback(() => setState(makeSample()), [])

  const value = useMemo(() => ({ state, update, reset, toast, toasts }), [state, update, reset, toast, toasts])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside provider')
  return s
}

export function uid(prefix = 'x'): string {
  return prefix + Math.random().toString(36).slice(2, 9)
}

/** Re-renders every second while a timer runs. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

export function itemSeconds(state: State, projectId: string, item: ShotItem, now: number): number {
  const t = state.timer
  const running = t && t.projectId === projectId && t.itemId === item.id
  return item.seconds + (running ? (now - t.startedAt) / 1000 : 0)
}

export function projectSeconds(state: State, p: Project, now: number): number {
  return p.shotList.reduce((sum, it) => sum + itemSeconds(state, p.id, it, now), 0)
}

/** Stops whatever timer is running and banks its time on the item. */
export function stopTimer(draft: State) {
  const t = draft.timer
  if (!t) return
  const p = draft.projects.find((x) => x.id === t.projectId)
  const it = p?.shotList.find((x) => x.id === t.itemId)
  if (it) it.seconds += Math.round((Date.now() - t.startedAt) / 1000)
  draft.timer = null
}

export function startTimer(draft: State, projectId: string, itemId: string) {
  stopTimer(draft)
  draft.timer = { projectId, itemId, startedAt: Date.now() }
}

export interface DayInfo {
  closed: boolean
  closedReason?: string
  holidays: Holiday[]
  warn?: Holiday
}

export function dayInfo(date: string, s: Settings): DayInfo {
  const weekday = parse(date).getDay()
  const byWeekday = s.closedWeekdays.includes(weekday) && !s.openDates.includes(date)
  const byDate = s.closedDates.includes(date)
  const closed = byWeekday || byDate
  return {
    closed,
    closedReason: closed ? (byDate ? 'Marked closed' : weekday === 6 ? 'Shabbos, closed' : 'Closed on ' + parse(date).toLocaleDateString('en-US', { weekday: 'long' }) + 's') : undefined,
    holidays: holidaysOn(date, s.israel),
    warn: blockingHoliday(date, s.israel),
  }
}

/** Heads-up text before scheduling on a closed day or holiday, or null if the day is clear. */
export function scheduleWarning(date: string, s: Settings): string | null {
  const info = dayInfo(date, s)
  if (info.warn) {
    const name = holidayShortName(info.warn)
    if (info.warn.kind === 'fast') return `This is ${name} (a fast day). Schedule anyway?`
    if (info.warn.kind === 'cholhamoed') return `This is Chol Hamoed ${name.replace(/\s*\(.*\)/, '')}. Schedule anyway?`
    return `This is ${name}. Schedule anyway?`
  }
  if (info.closed) return `You’re closed this day (${info.closedReason?.toLowerCase()}). Schedule anyway?`
  return null
}
