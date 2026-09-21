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

  it('names the candidate schema once and references it', () => {
    expect(document.components.schemas).toHaveProperty('PatientCandidate')
    expect(JSON.stringify(document.components.schemas.PatientLookupResponse)).toContain('#/components/schemas/PatientCandidate')
  })
})
