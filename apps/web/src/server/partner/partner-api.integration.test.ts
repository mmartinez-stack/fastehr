import { randomInt } from 'node:crypto'
import { createPatientInput, PATIENT_VERIFICATION_HEADER, scopesToPermissions } from '@fastehr/contracts'
import { db } from '@fastehr/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuditSink } from '../audit-log.ts'
import { apiKeyEndpoints } from '../auth.ts'
import { mintIntegrationKey, rotateOwnKey } from '../integration-keys.ts'
import { createPartnerContext } from './context.ts'
import { handlePartnerRequest } from './handle.ts'
import { createRateLimiter } from './rate-limit.ts'
import { resolveVerification } from './verification.ts'
import { recordingAuditRepository } from '../test-support/fake-db.ts'

/**
 * The partner API against real PostgreSQL and the real Better Auth instance
 * (ADR 36, ADR 38): a key minted the way the CLI mints one, verified by the
 * plugin, a lookup, a verification, the token honoured by the resolver, the
 * lockout surviving a fresh process (a new limiter, the same database), a
 * revocation taking effect at once, and the events the exchange produces
 * (ADR 37; the table write itself is covered in packages/db).
 *
 * Everything reaches the database through `Db` and the plugin, as the
 * application does (ADR 3), and nothing is truncated: each run invents its
 * own integration, patient, and phone, so it neither depends on nor
 * disturbs other suites' rows.
 */
const run = String(randomInt(1_000_000)).padStart(6, '0')
const PHONE = `951555${String(randomInt(10_000)).padStart(4, '0')}`

let patientId: string
let integrationId: string
let keyId: string
let KEY: string
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
      lastName: `Lovelace${run}`,
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

  const integration = await db.integrations.findOrCreate({ name: `Integration test ${run}` })
  integrationId = integration.id
  const created = await apiKeyEndpoints().createApiKey({
    body: {
      userId: integrationId,
      name: `Integration test ${run}`,
      prefix: 'fehr_dev_',
      expiresIn: 24 * 60 * 60,
      permissions: scopesToPermissions(['patients:lookup', 'patients:verify', 'queue:read']),
      metadata: { environment: 'dev', allowedIps: ['203.0.113.0/24'], locationIds: [], issuedBy: 'test' },
    },
  })
  keyId = created.id
  KEY = created.key
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('partner API end to end', () => {
  it('looks a patient up, verifies them, honours the token, and leaves the trail', async () => {
    expect(KEY.startsWith('fehr_dev_')).toBe(true)
    const stored = await db.integrations.findKey(keyId)
    expect(stored).toMatchObject({ integrationId, scopes: ['patients:lookup', 'patients:verify', 'queue:read'], enabled: true })
    expect(JSON.stringify(stored)).not.toContain(KEY)

    const lookup = await send('/patients/lookup', { body: { dateOfBirth: '1985-12-10', phone: `+1 ${PHONE}` } })
    expect(lookup.status).toBe(200)
    expect(await lookup.json()).toEqual({
      candidates: [{ patientId, firstName: 'Ada', lastName: `Lovelace${run}`, phoneLast4: PHONE.slice(-4), locationId: 'sylmar' }],
      truncated: false,
    })

    const verify = await send(`/patients/${patientId}/verify`, { body: { dateOfBirth: '1985-12-10', phone: PHONE } })
    expect(verify.status).toBe(200)
    const { verificationToken } = (await verify.json()) as { verificationToken: string }

    // No operation requires a token yet; the resolver the chain uses is the seam.
    const ctx = createPartnerContext({ requestId: 'r', ipAddress: null, userAgent: null, db })
    const resolved = await resolveVerification(ctx, {
      integrationId,
      patientId,
      headers: new Headers({ [PATIENT_VERIFICATION_HEADER]: verificationToken }),
    })
    expect(resolved).toMatchObject({ patientId, integrationId, useCount: 0 })
    expect(resolved).not.toHaveProperty('tokenHash')

    await sink.flush()
    expect(audit.events.map((event) => [event.actorKind, event.actorId, event.action, event.outcome, event.patientId, event.apiKeyId])).toEqual([
      ['integration', integrationId, 'patients.lookup', 'allowed', null, keyId],
      ['integration', integrationId, 'patients.verify', 'allowed', patientId, keyId],
    ])
    expect(audit.events[1]?.verificationId).toBe(resolved.id)
    expect(JSON.stringify(audit.events)).not.toContain('Lovelace')
  })

  it('cuts the OpenAPI document to the key presented, and shows nobody anything without one', async () => {
    const mine = (await (await send('/openapi.json')).json()) as { paths: Record<string, unknown> }
    expect(Object.keys(mine.paths).sort()).toEqual(['/patients/lookup', '/patients/{patientId}/verify', '/queue/count'])
    const anonymous = await handlePartnerRequest(new Request('http://localhost:3000/api/v1/openapi.json'), {
      enabled: true,
      env: {},
      rateLimiter: createRateLimiter(),
      audit: sink,
    })
    expect(((await anonymous.json()) as { paths: Record<string, unknown> }).paths).toEqual({})
  })

  it('refuses a key from outside the allowlist and a key that is not one of ours', async () => {
    const elsewhere = await handlePartnerRequest(
      new Request('http://localhost:3000/api/v1/queue/count', {
        headers: { authorization: `Bearer ${KEY}`, 'x-forwarded-for': '198.51.100.7' },
      }),
      { enabled: true, env: {}, rateLimiter: createRateLimiter(), audit: sink },
    )
    expect(elsewhere.status).toBe(401)
    expect((await send('/queue/count', { key: 'fehr_dev_notakey' })).status).toBe(401)
  })

  it('rotates a key through the plugin: the copy works, the old key keeps working for a day', async () => {
    const rotated = await rotateOwnKey(db, mintIntegrationKey, { integrationId, keyId })
    expect(rotated.key.startsWith('fehr_dev_')).toBe(true)
    expect(rotated.issued).toMatchObject({ integrationId, scopes: ['patients:lookup', 'patients:verify', 'queue:read'], enabled: true })
    expect(rotated.issued.metadata).toMatchObject({ environment: 'dev', allowedIps: ['203.0.113.0/24'], issuedBy: `self-service: Integration test ${run}` })
    expect((await send('/queue/count', { key: rotated.key })).status).toBe(200)
    expect((await send('/queue/count')).status).toBe(200)
    const previous = await db.integrations.findKey(keyId)
    expect(new Date(previous?.expiresAt ?? 0).getTime() - Date.now()).toBeLessThanOrEqual(24 * 60 * 60 * 1000)
    // Once an hour: the second attempt right away is refused.
    await expect(rotateOwnKey(db, mintIntegrationKey, { integrationId, keyId: rotated.issued.id })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
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

    expect(await db.integrations.disableKey(keyId)).toMatchObject({ enabled: false })
    expect((await send('/queue/count')).status).toBe(401)
    expect(await db.integrations.disableKey(keyId)).toBeNull()
  })
})
