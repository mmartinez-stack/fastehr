import { createHash, randomBytes, randomInt } from 'node:crypto'
import { createPatientInput, formatApiKey, PATIENT_VERIFICATION_HEADER } from '@fastehr/contracts'
import { db } from '@fastehr/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuditSink } from '../audit-log.ts'
import { createPartnerContext } from './context.ts'
import { handlePartnerRequest } from './handle.ts'
import { createRateLimiter } from './rate-limit.ts'
import { resolveVerification } from './verification.ts'
import { recordingAuditRepository } from '../test-support/fake-db.ts'

/**
 * The partner API against real PostgreSQL (ADR 36): a key issued the way
 * the CLI issues one, a lookup, a verification, the token honoured by the
 * resolver, the lockout surviving a fresh process (a new limiter, the same
 * database), and the events the exchange produces (ADR 35; the table write
 * itself is covered in packages/db).
 *
 * Everything reaches the database through `Db`, as the application does
 * (ADR 3), and nothing is truncated: each run invents its own key, patient,
 * and phone, so it neither depends on nor disturbs other suites' rows.
 */
const KEY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const keyId = Array.from({ length: 8 }, () => KEY_ALPHABET[randomInt(KEY_ALPHABET.length)]).join('')
const secret = randomBytes(32).toString('base64url')
const KEY = formatApiKey({ environment: 'dev', keyId, secret })
const PHONE = `951555${String(randomInt(10_000)).padStart(4, '0')}`

let patientId: string
let clientId: string
const audit = recordingAuditRepository()
const sink = createAuditSink(audit)

function send(path: string, init: { body?: unknown; key?: string } = {}) {
  const headers: Record<string, string> = { authorization: `Bearer ${init.key ?? KEY}`, 'x-forwarded-for': '203.0.113.5' }
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  return handlePartnerRequest(
    new Request(`http://localhost:3000/api/v1${path}`, {
      method: init.body === undefined ? 'GET' : 'POST',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    { enabled: true, env: {}, rateLimiter: createRateLimiter(), audit: sink },
  )
}

beforeEach(async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  audit.events.length = 0
  if (patientId !== undefined) return
  const patient = await db.patients.create(
    createPatientInput.parse({
      firstName: 'Ada',
      lastName: `Lovelace${keyId}`,
      gender: 'female',
      dateOfBirth: '1985-12-10',
      language: 'english',
      office: 'Sylmar',
      email: '',
      addressStreet: '10 Analytical Way',
      addressCity: 'Pasadena',
      addressState: 'CA',
      addressZip: '91101',
      phone: PHONE,
      phoneFollowUpAllowed: true,
      referralSource: '',
      referredByPatientId: '',
      programType: '',
      heightFeet: '5',
      heightInchesPart: '4',
      medications: [],
      conditions: [],
      pcpName: '',
      pcpAddress: '',
      pcpPhone: '',
      creditCardNumber: '',
      creditCardExpiry: '',
      creditCardZip: '',
    }),
  )
  patientId = patient.id
  const client = await db.apiClients.create({
    name: 'Integration test client',
    vendor: undefined,
    environment: 'dev',
    scopes: ['patients:lookup', 'patients:verify', 'queue:read'],
    allowedIps: ['203.0.113.0/24'],
    locationIds: [],
    baaSignedAt: undefined,
    issuedBy: 'test',
    keyId,
    keyHash: createHash('sha256').update(secret).digest('hex'),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  })
  clientId = client.id
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('partner API end to end', () => {
  it('looks a patient up, verifies them, honours the token, and leaves the trail', async () => {
    const lookup = await send('/patients/lookup', { body: { dateOfBirth: '1985-12-10', phone: `+1 ${PHONE}` } })
    expect(lookup.status).toBe(200)
    expect(await lookup.json()).toEqual({
      candidates: [{ patientId, firstName: 'Ada', lastName: `Lovelace${keyId}`, phoneLast4: PHONE.slice(-4), locationId: 'sylmar' }],
      truncated: false,
    })

    const verify = await send(`/patients/${patientId}/verify`, { body: { dateOfBirth: '1985-12-10', phone: PHONE } })
    expect(verify.status).toBe(200)
    const { verificationToken } = (await verify.json()) as { verificationToken: string }

    // No operation requires a token yet; the resolver the chain uses is the seam.
    const ctx = createPartnerContext({ requestId: 'r', ipAddress: null, userAgent: null, db })
    const resolved = await resolveVerification(ctx, {
      clientId,
      patientId,
      headers: new Headers({ [PATIENT_VERIFICATION_HEADER]: verificationToken }),
    })
    expect(resolved).toMatchObject({ patientId, apiClientId: clientId, useCount: 0 })
    expect(resolved).not.toHaveProperty('tokenHash')

    await sink.flush()
    expect(audit.events.map((event) => [event.action, event.outcome, event.patientId, event.apiKeyId])).toEqual([
      ['patients.lookup', 'allowed', null, keyId],
      ['patients.verify', 'allowed', patientId, keyId],
    ])
    expect(audit.events[1]?.verificationId).toBe(resolved.id)
    expect(JSON.stringify(audit.events)).not.toContain('Lovelace')
  })

  it('locks a patient out across processes, then refuses a revoked key at once', async () => {
    for (let i = 0; i < 5; i += 1) {
      const attempt = await send(`/patients/${patientId}/verify`, { body: { dateOfBirth: '1985-12-11', phone: PHONE } })
      expect(attempt.status).toBe(403)
    }
    const locked = await send(`/patients/${patientId}/verify`, { body: { dateOfBirth: '1985-12-10', phone: PHONE } })
    expect(locked.status).toBe(429)
    expect(locked.headers.get('retry-after')).toBe('1800')

    await db.queue.arrive({ patientId, locationId: 'sylmar', providerId: null })
    const count = await send('/queue/count?location=sylmar')
    expect(((await count.json()) as { waiting: number }).waiting).toBeGreaterThanOrEqual(1)

    await db.apiClients.revoke(clientId, new Date())
    expect((await send('/queue/count')).status).toBe(401)
  })
})
