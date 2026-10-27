import { describe, expect, it } from 'vitest'
import { friendlyDate, todayISO } from './dates'

describe('dates', () => {
  it('formats today as YYYY-MM-DD in local time', () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })

  it('names nearby days', () => {
    expect(friendlyDate('2026-10-27', '2026-10-27')).toBe('Today')
    expect(friendlyDate('2026-10-28', '2026-10-27')).toBe('Tomorrow')
    expect(friendlyDate('2026-10-26', '2026-10-27')).toBe('Yesterday')
    expect(friendlyDate('2026-11-01', '2026-10-31')).toBe('Tomorrow')
    expect(friendlyDate(null)).toBe('No date yet')
  })
})
