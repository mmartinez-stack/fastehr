import { describe, expect, it } from 'vitest'
import { API_SCOPES, PLANNED_SCOPES, partnerScopeSchema } from './scopes.ts'
import { PARTNER_OPERATIONS } from './operations.ts'

describe('partner scopes', () => {
  it('every operation names a scope from the vocabulary, or none', () => {
    for (const operation of PARTNER_OPERATIONS) {
      if (operation.scope === null) continue
      expect(partnerScopeSchema.safeParse(operation.scope).success).toBe(true)
    }
  })

  it('every scope is used by an operation or is a planned one, so the vocabulary cannot rot', () => {
    const used = new Set(PARTNER_OPERATIONS.map((operation) => operation.scope))
    for (const scope of API_SCOPES) {
      expect(used.has(scope) || PLANNED_SCOPES.includes(scope), scope).toBe(true)
    }
  })

  it('a planned scope is not also in use', () => {
    const used = new Set(PARTNER_OPERATIONS.map((operation) => operation.scope))
    for (const scope of PLANNED_SCOPES) expect(used.has(scope), scope).toBe(false)
  })

  it('refuses a scope outside the vocabulary', () => {
    expect(partnerScopeSchema.safeParse('patients:write').success).toBe(false)
  })
})
