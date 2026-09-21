import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ADA, GRACE, LOOKUP_BODY, partnerHarness, testKey, VERIFY_BODY } from '../../test-support/partner-fakes.ts'

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

type Envelope = { error: { code: string; validation?: unknown } }

describe('patient lookup', () => {
  it('finds by date of birth and phone, answering names, last four digits, and the clinic, never the date of birth', async () => {
    const harness = partnerHarness()
    const { status, body } = await harness.send({ path: '/patients/lookup', body: LOOKUP_BODY })
    expect(status).toBe(200)
    expect(body).toEqual({
      candidates: [{ patientId: ADA.patientId, firstName: 'Ada', lastName: 'Lovelace', phoneLast4: '0000', locationId: 'sylmar' }],
      truncated: false,
    })
    expect(JSON.stringify(body)).not.toContain('1985')
    expect(harness.audit.events[0]).toMatchObject({ outcome: 'allowed', action: 'patients.lookup', patientId: null })
  })

  it('finds by date of birth and last name, case-insensitively, and narrows by first name', async () => {
    const harness = partnerHarness()
    const both = await harness.send({ path: '/patients/lookup', body: { dateOfBirth: '1985-12-10', lastName: 'hopper' } })
    expect((both.body as { candidates: unknown[] }).candidates).toEqual([
      { patientId: GRACE.patientId, firstName: 'Grace', lastName: 'Hopper', phoneLast4: null, locationId: 'kanoga' },
    ])
    const narrowed = await harness.send({
      path: '/patients/lookup',
      body: { dateOfBirth: '1985-12-10', lastName: 'Hopper', firstName: 'Ada' },
    })
    expect(narrowed.body).toEqual({ candidates: [], truncated: false })
  })

  it('finds by patient id alone', async () => {
    const harness = partnerHarness()
    const { body } = await harness.send({ path: '/patients/lookup', body: { patientId: GRACE.patientId } })
    expect((body as { candidates: { patientId: string }[] }).candidates.map((c) => c.patientId)).toEqual([GRACE.patientId])
  })

  it('refuses a lookup without a date of birth', async () => {
    const harness = partnerHarness()
    const { status, body } = await harness.send({ path: '/patients/lookup', body: { lastName: 'Lovelace', phone: '9515550000' } })
    expect(status).toBe(400)
    expect((body as Envelope).error).toMatchObject({ code: 'invalid_input', validation: { fieldErrors: { dateOfBirth: ['custom'] } } })
  })

  it('answers an empty, truncated list past the cap rather than paging', async () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      ...ADA,
      patientId: `${ADA.patientId.slice(0, -1)}${i}`,
      firstName: `Ada${i}`,
    }))
    const harness = partnerHarness({ patients: many })
    const { body } = await harness.send({ path: '/patients/lookup', body: { dateOfBirth: '1985-12-10', lastName: 'Lovelace' } })
    expect(body).toEqual({ candidates: [], truncated: true })
  })

  it('a key restricted to a clinic sees only that clinic', async () => {
    const harness = partnerHarness({ keys: [testKey({ metadata: { locationIds: ['kanoga'] } })] })
    const { body } = await harness.send({ path: '/patients/lookup', body: LOOKUP_BODY })
    expect(body).toEqual({ candidates: [], truncated: false })
  })

  it('limits repeated lookups of the same identifiers', async () => {
    const harness = partnerHarness()
    for (let i = 0; i < 5; i += 1) expect((await harness.send({ path: '/patients/lookup', body: LOOKUP_BODY })).status).toBe(200)
    const sixth = await harness.send({ path: '/patients/lookup', body: LOOKUP_BODY })
    expect(sixth.status).toBe(429)
    expect((await harness.send({ path: '/patients/lookup', body: { dateOfBirth: '1985-12-10', lastName: 'Hopper' } })).status).toBe(200)
  })
})

describe('patient verification', () => {
  it('issues a token when both factors match, and records the subject', async () => {
    const harness = partnerHarness()
    const { status, body } = await harness.send({ path: `/patients/${ADA.patientId}/verify`, body: VERIFY_BODY })
    expect(status).toBe(200)
    expect(body).toEqual({ verified: true, verificationToken: expect.any(String), expiresAt: '2026-09-17T12:15:00.000Z' })
    expect(harness.verifications.attempts).toEqual([expect.objectContaining({ patientId: ADA.patientId, succeeded: true })])
    expect(harness.audit.events[0]).toMatchObject({
      outcome: 'allowed',
      action: 'patients.verify',
      patientId: ADA.patientId,
      verificationId: 'verification-1',
    })
  })

  it('refuses a wrong date of birth, a wrong phone, an unknown patient, a patient without a phone, and a patient outside the key\'s clinics with one code', async () => {
    const harness = partnerHarness({ keys: [testKey({ metadata: { locationIds: ['sylmar'] } })] })
    const cases: Array<[string, unknown]> = [
      [`/patients/${ADA.patientId}/verify`, { ...VERIFY_BODY, dateOfBirth: '1985-12-11' }],
      [`/patients/${ADA.patientId}/verify`, { ...VERIFY_BODY, phone: '9515550001' }],
      ['/patients/00000000-0000-4000-8000-000000000001/verify', VERIFY_BODY],
      [`/patients/${GRACE.patientId}/verify`, VERIFY_BODY],
    ]
    for (const [path, body] of cases) {
      const result = await harness.send({ path, body })
      expect(result.status, path).toBe(403)
      expect((result.body as Envelope).error.code).toBe('verification_failed')
    }
    expect(harness.verifications.attempts.every((attempt) => !attempt.succeeded)).toBe(true)
    expect(harness.audit.events.at(-1)).toMatchObject({ outcome: 'denied', code: 'verification_failed', patientId: GRACE.patientId })
  })

  it('locks the patient out after five failures, with Retry-After', async () => {
    const harness = partnerHarness()
    for (let i = 0; i < 5; i += 1) {
      await harness.send({ path: `/patients/${ADA.patientId}/verify`, body: { ...VERIFY_BODY, phone: '9515550001' } })
    }
    const locked = await harness.send({ path: `/patients/${ADA.patientId}/verify`, body: VERIFY_BODY })
    expect(locked.status).toBe(429)
    expect((locked.body as Envelope).error.code).toBe('verification_locked')
    expect(locked.headers.get('retry-after')).toBe('1800')
    // The correct answer was never checked while locked.
    expect(harness.verifications.attempts).toHaveLength(5)
  })

  it('refuses a malformed patient id as invalid input, not as a verification failure', async () => {
    const harness = partnerHarness()
    const { status, body } = await harness.send({ path: '/patients/not-a-uuid/verify', body: VERIFY_BODY })
    expect(status).toBe(400)
    expect((body as Envelope).error).toMatchObject({ code: 'invalid_input', validation: { fieldErrors: { patientId: ['invalid_format'] } } })
  })
})
