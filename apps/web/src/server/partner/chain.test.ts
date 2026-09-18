import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ADA, LOOKUP_BODY, OTHER_KEY_ID, partnerHarness, testClient, testKey, TEST_SECRET } from '../test-support/partner-fakes.ts'

/**
 * The partner chain end to end through `handlePartnerRequest`, with fakes:
 * audit outermost, authentication, scope, rate limit, validation, output
 * shaping, and the transport rules. Every refusal must leave an audit row
 * (ADR 10, ADR 35) and never a word of the request.
 */
beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('partner chain: authentication', () => {
  it('refuses an anonymous call with 401, a challenge, and an audit row', async () => {
    const harness = partnerHarness()
    const { status, body, headers } = await harness.send({ path: '/patients/lookup', key: null, body: LOOKUP_BODY })

    expect(status).toBe(401)
    expect(body).toEqual({ error: { code: 'unauthenticated', requestId: expect.any(String) } })
    expect(headers.get('www-authenticate')).toContain('Bearer')
    expect(headers.get('cache-control')).toBe('no-store')
    expect(headers.get('x-request-id')).toBe((body as { error: { requestId: string } }).error.requestId)
    expect(harness.audit.events).toEqual([
      expect.objectContaining({
        transport: 'rest',
        actorKind: 'anonymous',
        actorId: null,
        action: 'patients.lookup',
        routeTemplate: '/patients/lookup',
        outcome: 'denied',
        code: 'unauthenticated',
        httpStatus: 401,
      }),
    ])
  })

  it('refuses a wrong secret, an unknown key id, a malformed key, and an expired key identically', async () => {
    const harness = partnerHarness({ now: () => new Date('2027-06-01T00:00:00.000Z') })
    for (const key of [testKey(TEST_SECRET.slice(0, 8), 'x'.repeat(43)), testKey(OTHER_KEY_ID), 'not-a-key', testKey()]) {
      const { status, body } = await harness.send({ path: '/patients/lookup', key, body: LOOKUP_BODY })
      expect(status, key).toBe(401)
      expect((body as { error: { code: string } }).error.code).toBe('unauthenticated')
    }
  })

  it('refuses an address outside the allowlist as unauthenticated', async () => {
    const harness = partnerHarness({ clients: [testClient({ allowedIps: ['198.51.100.0/24'] })] })
    expect((await harness.send({ path: '/patients/lookup', body: LOOKUP_BODY })).status).toBe(401)
    const allowed = partnerHarness({ clients: [testClient({ allowedIps: ['203.0.113.0/24'] })] })
    expect((await allowed.send({ path: '/patients/lookup', body: LOOKUP_BODY })).status).toBe(200)
  })

  it('never accepts a key in the query string', async () => {
    const harness = partnerHarness()
    const { status } = await harness.send({ path: `/queue/count?api_key=${testKey()}`, key: null })
    expect(status).toBe(401)
  })
})

describe('partner chain: authorization and limits', () => {
  it('refuses a key without the scope with 403, recorded against the key', async () => {
    const harness = partnerHarness({ clients: [testClient({ scopes: ['queue:read'] })] })
    const { status, body } = await harness.send({ path: '/patients/lookup', body: LOOKUP_BODY })

    expect(status).toBe(403)
    expect((body as { error: { code: string } }).error.code).toBe('forbidden')
    expect(harness.audit.events[0]).toMatchObject({
      actorKind: 'api_client',
      actorId: 'client-1',
      apiKeyId: 'TESTKEY1',
      outcome: 'denied',
      code: 'forbidden',
    })
  })

  it('answers 429 with Retry-After once the identity bucket is empty', async () => {
    const harness = partnerHarness()
    let last: Awaited<ReturnType<typeof harness.send>> | undefined
    for (let i = 0; i < 31; i += 1) {
      last = await harness.send({ path: '/patients/lookup', body: { dateOfBirth: '1985-12-10', lastName: `Person${i}` } })
    }
    expect(last?.status).toBe(429)
    expect((last?.body as { error: { code: string } }).error.code).toBe('rate_limited')
    expect(Number(last?.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(harness.audit.events.at(-1)).toMatchObject({ outcome: 'denied', code: 'rate_limited' })
  })

  it('stops asking the database about an address that keeps failing authentication', async () => {
    const harness = partnerHarness()
    const findByCredential = vi.spyOn(harness.db.apiClients, 'findByCredential')
    for (let i = 0; i < 30; i += 1) await harness.send({ path: '/queue/count', key: testKey(OTHER_KEY_ID) })
    const calls = findByCredential.mock.calls.length
    const { status, body } = await harness.send({ path: '/queue/count' })
    expect(status).toBe(429)
    expect((body as { error: { code: string } }).error.code).toBe('rate_limited')
    expect(findByCredential.mock.calls.length).toBe(calls)
  })
})

describe('partner chain: validation and shaping', () => {
  it('reports a bad body as field paths and issue codes, never text', async () => {
    const harness = partnerHarness()
    const { status, body } = await harness.send({ path: '/patients/lookup', body: { lastName: 'Lovelace' } })

    expect(status).toBe(400)
    expect(body).toEqual({
      error: {
        code: 'invalid_input',
        requestId: expect.any(String),
        validation: { fieldErrors: { dateOfBirth: ['custom'] }, formErrors: [] },
      },
    })
    expect(JSON.stringify(body)).not.toContain('Lovelace')
    expect(harness.audit.events[0]).toMatchObject({ outcome: 'error', code: 'invalid_input' })

    // A field the contract does not describe is refused as a whole, so a
    // card number or an address a vendor sends by mistake is never stored.
    const extra = await harness.send({ path: '/patients/lookup', body: { ...LOOKUP_BODY, cardNumber: '4111' } })
    expect(extra.status).toBe(400)
    expect((extra.body as { error: { validation: { formErrors: string[] } } }).error.validation.formErrors).toEqual([
      'unrecognized_keys',
    ])
    expect(JSON.stringify(extra.body)).not.toContain('4111')
  })

  it('refuses a body that is not JSON, not declared as JSON, or too large', async () => {
    const harness = partnerHarness()
    expect((await harness.send({ path: '/patients/lookup', rawBody: '{oops', contentType: 'application/json' })).body).toMatchObject({
      error: { code: 'invalid_input', validation: { fieldErrors: {}, formErrors: ['invalid_json'] } },
    })
    expect((await harness.send({ path: '/patients/lookup', rawBody: 'a=b', contentType: 'text/plain' })).status).toBe(415)
    expect(
      (await harness.send({ path: '/patients/lookup', rawBody: JSON.stringify({ lastName: 'x'.repeat(20_000) }) })).status,
    ).toBe(413)
  })

  it('refuses a handler result outside the contract rather than sending it', async () => {
    const harness = partnerHarness()
    const { status, body } = await harness.send({
      path: '/patients/lookup',
      body: LOOKUP_BODY,
      ...({} as object),
    })
    expect(status).toBe(200)

    const leaking = partnerHarness()
    leaking.options.handlers = {
      'patients.lookup': async () => ({
        candidates: [{ ...ADA, phoneLast4: '0000', dateOfBirthLeak: ADA.dateOfBirth } as never],
        truncated: false,
      }),
      'patients.verify': async () => {
        throw new Error('not under test')
      },
      'queue.count': async () => {
        throw new Error('not under test')
      },
    }
    const result = await leaking.send({ path: '/patients/lookup', body: LOOKUP_BODY })
    expect(result.status).toBe(500)
    expect(JSON.stringify(result.body)).not.toContain('1985')
    expect(JSON.stringify(body)).not.toContain('1985')
  })
})

describe('partner chain: transport', () => {
  it('is dark when the kill switch is off, the documents included', async () => {
    const harness = partnerHarness({ enabled: false })
    for (const path of ['/openapi.json', '/docs', '/queue/count']) {
      expect((await harness.send({ path })).status, path).toBe(404)
    }
    expect(harness.audit.events).toEqual([])
  })

  it('reads the switch from the environment when not overridden', async () => {
    const off = partnerHarness({ env: {} })
    off.options.enabled = undefined
    expect((await off.send({ path: '/openapi.json' })).status).toBe(404)
    const on = partnerHarness({ env: { PARTNER_API_ENABLED: 'true' } })
    on.options.enabled = undefined
    expect((await on.send({ path: '/openapi.json' })).status).toBe(200)
  })

  it('serves the OpenAPI document and the docs page without a key', async () => {
    const harness = partnerHarness()
    const spec = await harness.send({ path: '/openapi.json', key: null })
    expect(spec.status).toBe(200)
    expect(spec.body).toMatchObject({ openapi: '3.1.0' })
    expect(spec.headers.get('cache-control')).toBe('no-store')

    const docs = await harness.send({ path: '/docs', key: null })
    expect(docs.status).toBe(200)
    expect(docs.headers.get('content-type')).toContain('text/html')
    expect(docs.headers.get('content-security-policy')).toContain("script-src 'self'")
    expect(String(docs.body)).not.toMatch(/https?:\/\/(?!test\.invalid)/)
    expect(harness.audit.events).toEqual([])
  })

  it('answers 404 for an unknown route and 405 with Allow for the wrong verb', async () => {
    const harness = partnerHarness()
    expect((await harness.send({ path: '/patients' })).status).toBe(404)
    const wrongVerb = await harness.send({ path: '/patients/lookup' })
    expect(wrongVerb.status).toBe(405)
    expect(wrongVerb.headers.get('allow')).toBe('POST')
  })

  it('never carries a CORS header', async () => {
    const harness = partnerHarness()
    const { headers } = await harness.send({ path: '/queue/count', headers: { origin: 'https://vendor.example' } })
    expect(headers.get('access-control-allow-origin')).toBeNull()
  })
})
