import { describe, expect, it } from 'vitest'
import { ROLE_ACCESS, ROLE_SURFACES, STAFF_ROLES, roleHasAccess } from './staff-role.ts'

/**
 * The access matrix, pinned as data. Every role has an answer for every
 * surface (no role reaches a surface by omission), and the two relations the
 * medical director role is defined by hold: everything a provider has, and
 * everything an admin has, plus the review queue.
 */
describe('the role access matrix', () => {
  it('answers every role for every surface', () => {
    for (const role of STAFF_ROLES) {
      for (const surface of ROLE_SURFACES) {
        expect(typeof ROLE_ACCESS[role][surface]).toBe('boolean')
      }
    }
  })

  it('makes the medical director a superset of the provider and of the admin, plus review', () => {
    for (const surface of ROLE_SURFACES) {
      if (ROLE_ACCESS.provider[surface]) expect(ROLE_ACCESS.medical_director[surface]).toBe(true)
      if (ROLE_ACCESS.admin[surface]) expect(ROLE_ACCESS.medical_director[surface]).toBe(true)
    }
    expect(ROLE_ACCESS.medical_director.review).toBe(true)
    expect(STAFF_ROLES.filter((role) => ROLE_ACCESS[role].review)).toEqual(['medical_director'])
  })

  it('denies an unknown role rather than defaulting it', () => {
    expect(roleHasAccess('superuser', 'staff')).toBe(false)
    expect(roleHasAccess('', 'clinical')).toBe(false)
    expect(roleHasAccess('frontdesk', 'clerical')).toBe(true)
  })
})
