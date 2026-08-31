import { describe, expect, it } from 'vitest'
import { searchStaffUsersInput } from './staff-user.ts'

describe('searchStaffUsersInput', () => {
  it('reads an @ anywhere as an email query, lowercased', () => {
    expect(searchStaffUsersInput.parse({ query: ' June.Osei@Example.com ' })).toEqual({
      query: { kind: 'email', email: 'june.osei@example.com' },
    })
    // A partial email dispatches the same way — matching is substring.
    expect(searchStaffUsersInput.parse({ query: '@example' })).toEqual({
      query: { kind: 'email', email: '@example' },
    })
  })

  it('reads anything else as a name query', () => {
    expect(searchStaffUsersInput.parse({ query: ' Garcia ' })).toEqual({
      query: { kind: 'name', name: 'Garcia' },
    })
  })

  it('requires two characters', () => {
    expect(searchStaffUsersInput.safeParse({ query: 'G' }).success).toBe(false)
  })
})
