import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PARTNER_ERROR_STATUS } from './errors.ts'
import { buildPartnerOpenApiDocument } from './openapi.ts'
import { PARTNER_OPERATIONS } from './operations.ts'

const COMMITTED = fileURLToPath(new URL('../../../../docs/partner-api/openapi.json', import.meta.url))

describe('partner OpenAPI document', () => {
  const document = buildPartnerOpenApiDocument() as {
    paths: Record<string, Record<string, { responses: Record<string, unknown>; security: unknown[] }>>
    components: { schemas: Record<string, unknown> }
  }

  it('matches the committed copy (run `pnpm --filter @fastehr/contracts openapi:write`)', () => {
    const committed = readFileSync(COMMITTED, 'utf8')
    expect(committed).toBe(`${JSON.stringify(buildPartnerOpenApiDocument(), null, 2)}\n`)
  })

  it('documents every registered operation, and nothing else', () => {
    const documented = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
    )
    expect(documented.sort()).toEqual(PARTNER_OPERATIONS.map((op) => `${op.method} ${op.path}`).sort())
  })

  it('every operation lists the 401 and 429 it can answer with, under bearer security', () => {
    for (const operation of PARTNER_OPERATIONS) {
      const entry = document.paths[operation.path]?.[operation.method.toLowerCase()]
      expect(entry, operation.id).toBeDefined()
      expect(Object.keys(entry?.responses ?? {})).toEqual(
        expect.arrayContaining([String(PARTNER_ERROR_STATUS.unauthenticated), String(PARTNER_ERROR_STATUS.rate_limited)]),
      )
      expect(entry?.security).toEqual([{ bearerKey: operation.scope === null ? [] : [operation.scope] }])
    }
  })

  it('carries no example that looks like a real record', () => {
    const text = JSON.stringify(document)
    expect(text).not.toMatch(/\d{3}-\d{3}-\d{4}/)
    expect(text).not.toContain('creditCard')
  })

  it('cut to a key\'s scopes, shows only what that key can call, and only the schemas those calls reach', () => {
    type Doc = { paths: Record<string, unknown>; tags: { name: string }[]; components: { schemas: Record<string, unknown>; securitySchemes: { bearerKey: { description: string } } } }
    const queueOnly = buildPartnerOpenApiDocument({ scopes: ['queue:read'] }) as Doc
    expect(Object.keys(queueOnly.paths)).toEqual(['/queue/count'])
    expect(queueOnly.tags.map((tag) => tag.name)).toEqual(['queue'])
    expect(Object.keys(queueOnly.components.schemas).sort()).toEqual(['ErrorResponse', 'QueueCountResponse', 'QueueLocationCount'])
    expect(queueOnly.components.securitySchemes.bearerKey.description).toContain('queue:read')
    expect(queueOnly.components.securitySchemes.bearerKey.description).not.toContain('patients:lookup')

    const identity = buildPartnerOpenApiDocument({ scopes: ['patients:lookup', 'patients:verify'] }) as Doc
    expect(Object.keys(identity.paths).sort()).toEqual(['/patients/lookup', '/patients/{patientId}/verify'])
    expect(identity.components.schemas).toHaveProperty('PatientCandidate')
    expect(identity.components.schemas).not.toHaveProperty('QueueCountResponse')

    const skeleton = buildPartnerOpenApiDocument({ scopes: [] }) as Doc
    expect(skeleton.paths).toEqual({})
    expect(skeleton.tags).toEqual([])
    expect(Object.keys(skeleton.components.schemas)).toEqual(['ErrorResponse'])
    expect(skeleton.components.securitySchemes.bearerKey.description).toContain('Present yours')

    // A scope with no mounted operation adds nothing, and the full reference names only mounted scopes.
    expect(buildPartnerOpenApiDocument({ scopes: ['medications:read'] }).paths).toEqual({})
    expect((document as unknown as Doc).components.securitySchemes.bearerKey.description).toBe(
      'A partner API key. Scopes: patients:lookup, patients:verify, queue:read.',
    )
  })

  it('names the candidate schema once and references it', () => {
    expect(document.components.schemas).toHaveProperty('PatientCandidate')
    expect(JSON.stringify(document.components.schemas.PatientLookupResponse)).toContain('#/components/schemas/PatientCandidate')
  })
})
