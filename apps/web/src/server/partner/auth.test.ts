import { describe, expect, it } from 'vitest'
import { ipAllowed } from './auth.ts'

describe('ipAllowed', () => {
  it('allows any address when the list is empty, and none when the address is unknown', () => {
    expect(ipAllowed([], null)).toBe(true)
    expect(ipAllowed([], '203.0.113.5')).toBe(true)
    expect(ipAllowed(['203.0.113.5'], null)).toBe(false)
  })

  it('matches exact addresses and IPv4 ranges', () => {
    expect(ipAllowed(['203.0.113.5'], '203.0.113.5')).toBe(true)
    expect(ipAllowed(['203.0.113.5'], '203.0.113.6')).toBe(false)
    expect(ipAllowed(['203.0.113.0/24'], '203.0.113.200')).toBe(true)
    expect(ipAllowed(['203.0.113.0/24'], '203.0.114.1')).toBe(false)
    expect(ipAllowed(['10.0.0.0/8', '203.0.113.5/32'], '203.0.113.5')).toBe(true)
    expect(ipAllowed(['0.0.0.0/0'], '198.51.100.7')).toBe(true)
  })

  it('matches IPv6 exactly and refuses garbage entries', () => {
    expect(ipAllowed(['2001:DB8::1'], '2001:db8::1')).toBe(true)
    expect(ipAllowed(['2001:db8::/32'], '2001:db8::1')).toBe(false)
    expect(ipAllowed(['not-an-address'], '203.0.113.5')).toBe(false)
    expect(ipAllowed(['203.0.113.0/40'], '203.0.113.5')).toBe(false)
  })
})
