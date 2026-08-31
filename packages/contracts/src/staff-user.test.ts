import { describe, expect, it } from 'vitest'
import { createStaffUserInput, searchStaffUsersInput, updateStaffUserInput } from './staff-user.ts'

describe('createStaffUserInput', () => {
  it('normalizes the email and trims the name', () => {
    expect(
      createStaffUserInput.parse({ name: ' June Osei ', email: ' June@Example.COM ', role: 'frontdesk' }),
    ).toEqual({ name: 'June Osei', email: 'june@example.com', role: 'frontdesk' })
  })

  it('rejects a blank name, an invalid email, and an unknown role', () => {
    expect(createStaffUserInput.safeParse({ name: '  ', email: 'a@b.co', role: 'admin' }).success).toBe(false)
    expect(createStaffUserInput.safeParse({ name: 'X', email: 'not-an-email', role: 'admin' }).success).toBe(false)
    expect(createStaffUserInput.safeParse({ name: 'X', email: 'a@b.co', role: 'superuser' }).success).toBe(false)
  })
})

describe('updateStaffUserInput', () => {
  it('accepts partial updates but never a blank name', () => {
    expect(updateStaffUserInput.parse({ id: 'staff-1', role: 'provider' })).toEqual({
      id: 'staff-1',
      role: 'provider',
    })
    expect(updateStaffUserInput.safeParse({ id: 'staff-1', name: '  ' }).success).toBe(false)
  })
})

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

  it('accepts the account-state filter alone, and combined with a query', () => {
    expect(searchStaffUsersInput.parse({ query: '', status: 'disabled' })).toEqual({
      query: undefined,
      status: 'disabled',
    })
    expect(searchStaffUsersInput.parse({ query: 'Garcia', status: 'active' })).toEqual({
      query: { kind: 'name', name: 'Garcia' },
      status: 'active',
    })
  })

  it('refuses an entirely empty search', () => {
    expect(searchStaffUsersInput.safeParse({ query: '', status: '' }).success).toBe(false)
  })
})
