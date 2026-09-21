import { describe, expect, it } from 'vitest'
import { apiKeyMetadataSchema, issueIntegrationKeyInput, permissionsToScopes, scopesToPermissions } from './keys.ts'

describe('scopes as plugin permissions', () => {
  it('round-trips the vocabulary and drops what is not in it', () => {
    expect(scopesToPermissions(['patients:lookup', 'patients:verify', 'queue:read'])).toEqual({
      patients: ['lookup', 'verify'],
      queue: ['read'],
    })
    expect(permissionsToScopes({ patients: ['verify', 'lookup', 'delete'], queue: ['read'], nope: ['x'] })).toEqual([
      'patients:lookup',
      'patients:verify',
      'queue:read',
    ])
    expect(permissionsToScopes(null)).toEqual([])
    expect(permissionsToScopes('patients:lookup')).toEqual([])
  })
})

describe('key metadata and issuance input', () => {
  it('refuses a live key without a signed agreement', () => {
    const base = { name: 'Voice assistant', environment: 'live', scopes: ['patients:lookup'], issuedBy: 'ops' }
    expect(issueIntegrationKeyInput.safeParse(base).success).toBe(false)
    expect(issueIntegrationKeyInput.safeParse({ ...base, baaSignedAt: '2026-09-01' }).success).toBe(true)
    expect(issueIntegrationKeyInput.safeParse({ ...base, environment: 'dev' }).success).toBe(true)
  })

  it('defaults the optional settings and refuses an unknown clinic', () => {
    expect(apiKeyMetadataSchema.parse({ environment: 'dev', issuedBy: 'ops' })).toEqual({
      environment: 'dev',
      vendor: null,
      allowedIps: [],
      locationIds: [],
      baaSignedAt: null,
      issuedBy: 'ops',
    })
    expect(apiKeyMetadataSchema.safeParse({ environment: 'dev', issuedBy: 'ops', locationIds: ['mars'] }).success).toBe(false)
  })
})
