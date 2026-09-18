import { PATIENT_VERIFICATION_HEADER } from '@fastehr/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPartnerContext, type PartnerContext } from './context.ts'
import { PartnerApiError } from './errors.ts'
import { createRateLimiter } from './rate-limit.ts'
import { fakeDb } from '../test-support/fake-db.ts'
import { ADA, fakeVerifications, NOW, type FakeVerifications } from '../test-support/partner-fakes.ts'
import { assertNotLockedOut, factorsMatch, hashToken, issueVerificationToken, resolveVerification } from './verification.ts'

let clock = NOW
let verifications: FakeVerifications
let ctx: PartnerContext

beforeEach(() => {
  clock = NOW
  verifications = fakeVerifications(() => clock)
  ctx = createPartnerContext({
    requestId: 'r-1',
    ipAddress: '203.0.113.5',
    userAgent: null,
    db: fakeDb({ verifications }),
    now: () => clock,
    rateLimiter: createRateLimiter(),
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

const CLIENT = 'client-1'

describe('verification tokens', () => {
  it('issues a token whose hash alone is stored, honoured for fifteen minutes', async () => {
    const issued = await issueVerificationToken(ctx, { clientId: CLIENT, patientId: ADA.patientId })
    expect(issued.token.length).toBeGreaterThanOrEqual(43)
    expect(issued.expiresAt.toISOString()).toBe('2026-09-17T12:15:00.000Z')
    expect(verifications.rows[0]?.tokenHash).toBe(hashToken(issued.token))
    expect(JSON.stringify(verifications.rows)).not.toContain(issued.token)

    const headers = new Headers({ [PATIENT_VERIFICATION_HEADER]: issued.token })
    const resolved = await resolveVerification(ctx, { clientId: CLIENT, patientId: ADA.patientId, headers })
    expect(resolved.id).toBe(issued.verification.id)
    expect(verifications.rows[0]?.useCount).toBe(1)

    clock = new Date('2026-09-17T12:15:00.000Z')
    await expect(resolveVerification(ctx, { clientId: CLIENT, patientId: ADA.patientId, headers })).rejects.toMatchObject({
      code: 'verification_required',
    })
  })

  it('refuses an absent, unknown, other-client, or other-patient token with one code', async () => {
    const issued = await issueVerificationToken(ctx, { clientId: CLIENT, patientId: ADA.patientId })
    const cases: Array<[string, Headers]> = [
      ['absent', new Headers()],
      ['unknown', new Headers({ [PATIENT_VERIFICATION_HEADER]: 'x'.repeat(43) })],
      ['other client', new Headers({ [PATIENT_VERIFICATION_HEADER]: issued.token })],
    ]
    for (const [label, headers] of cases) {
      const clientId = label === 'other client' ? 'client-2' : CLIENT
      await expect(
        resolveVerification(ctx, { clientId, patientId: ADA.patientId, headers }),
        label,
      ).rejects.toMatchObject({ code: 'verification_required' })
    }
    await expect(
      resolveVerification(ctx, {
        clientId: CLIENT,
        patientId: '5c2b8d3f-1a4e-4f6b-8c7d-9e0f1a2b3c4d',
        headers: new Headers({ [PATIENT_VERIFICATION_HEADER]: issued.token }),
      }),
    ).rejects.toMatchObject({ code: 'verification_required' })
  })
})

describe('factorsMatch', () => {
  it('matches only when both factors match, and never a patient without a phone', () => {
    expect(factorsMatch(ADA, { dateOfBirth: '1985-12-10', phone: '9515550000' })).toBe(true)
    expect(factorsMatch(ADA, { dateOfBirth: '1985-12-11', phone: '9515550000' })).toBe(false)
    expect(factorsMatch(ADA, { dateOfBirth: '1985-12-10', phone: '9515550001' })).toBe(false)
    expect(factorsMatch({ ...ADA, phone: null }, { dateOfBirth: '1985-12-10', phone: '9515550000' })).toBe(false)
    expect(factorsMatch(undefined, { dateOfBirth: '1985-12-10', phone: '9515550000' })).toBe(false)
  })
})

describe('lockout', () => {
  async function fail(patientId: string = ADA.patientId, times = 1) {
    for (let i = 0; i < times; i += 1) {
      await verifications.recordAttempt({ apiClientId: CLIENT, patientId, succeeded: false, ipAddress: null })
    }
  }

  it('locks a patient after five failures for thirty minutes', async () => {
    await fail(ADA.patientId, 4)
    await expect(assertNotLockedOut(ctx, { clientId: CLIENT, patientId: ADA.patientId })).resolves.toBeUndefined()
    await fail()
    await expect(assertNotLockedOut(ctx, { clientId: CLIENT, patientId: ADA.patientId })).rejects.toMatchObject({
      code: 'verification_locked',
      retryAfterSeconds: 1800,
    })
    clock = new Date(NOW.getTime() + 31 * 60 * 1000)
    await expect(assertNotLockedOut(ctx, { clientId: CLIENT, patientId: ADA.patientId })).resolves.toBeUndefined()
  })

  it('a success resets the patient count', async () => {
    await fail(ADA.patientId, 4)
    clock = new Date(NOW.getTime() + 60 * 1000)
    await verifications.recordAttempt({ apiClientId: CLIENT, patientId: ADA.patientId, succeeded: true, ipAddress: null })
    clock = new Date(NOW.getTime() + 120 * 1000)
    await fail(ADA.patientId, 4)
    await expect(assertNotLockedOut(ctx, { clientId: CLIENT, patientId: ADA.patientId })).resolves.toBeUndefined()
  })

  it('pauses the whole client after fifty failures across patients', async () => {
    for (let i = 0; i < 50; i += 1) await fail(`patient-${i}`)
    const error = await assertNotLockedOut(ctx, { clientId: CLIENT, patientId: 'fresh' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PartnerApiError)
    expect((error as PartnerApiError).retryAfterSeconds).toBe(600)
    expect(console.warn).toHaveBeenCalled()
  })
})
