import { describe, expect, it } from 'vitest'
import { autoLimitOf, decideApproval, defaultApprovalPrefs as d, describeApprovalPrefs, normalizeApprovalPrefs } from './approvalRules'

describe('approval rules', () => {
  it('asks only over the limit', () => {
    expect(decideApproval(d, 100).auto).toBe(true)
    expect(decideApproval(d, 200).auto).toBe(false)
  })
  it('always / never', () => {
    expect(decideApproval({ ...d, mode: 'always' }, 1).auto).toBe(false)
    expect(decideApproval({ ...d, mode: 'never' }, 5000).auto).toBe(true)
    expect(autoLimitOf({ ...d, mode: 'always' })).toBe(0)
  })
  it('emergencies go ahead up to their own limit', () => {
    expect(decideApproval({ ...d, mode: 'always' }, 250, { emergency: true }).auto).toBe(true)
    expect(decideApproval(d, 400, { emergency: true }).auto).toBe(false)
  })
  it('the monthly budget wins', () => {
    const p = { ...d, mode: 'never' as const, monthly_budget: 500 }
    expect(decideApproval(p, 100, { spentThisMonth: 450 }).auto).toBe(false)
    expect(decideApproval(p, 100, { spentThisMonth: 300 }).auto).toBe(true)
  })
  it('describes and cleans up', () => {
    expect(describeApprovalPrefs(d)[0]).toBe('Ask only for jobs over $150')
    expect(normalizeApprovalPrefs({ mode: 'x', limit: -5 })).toMatchObject({ mode: 'over', limit: 150, contact: 'text' })
    expect(normalizeApprovalPrefs(null)).toBeNull()
  })
})
