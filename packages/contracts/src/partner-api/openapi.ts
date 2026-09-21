import { z } from 'zod'
import { PATIENT_VERIFICATION_HEADER } from './keys.ts'
import { PARTNER_ERROR_STATUS, partnerErrorSchema } from './errors.ts'
import { documentedErrors, PARTNER_OPERATIONS, type PartnerOperation } from './operations.ts'
import { partnerPatientCandidateSchema } from './patients.ts'
import { partnerQueueLocationCountSchema } from './queue.ts'
import { API_SCOPES } from './scopes.ts'

/**
 * The OpenAPI 3.1 document for the partner API, built from the registry and
 * the Zod schemas (ADR 38). Zod 4 emits JSON Schema 2020-12 natively, which
 * is the dialect OpenAPI 3.1 consumes, so there is no generator dependency:
 * this module lives in contracts because it is the one package that may
 * import Zod (ADR 5).
 *
 * Request bodies are rendered in `io: 'input'` mode (the shape a caller
 * sends, before normalisation) and responses in `io: 'output'` mode. Every
 * named schema goes through a registry, so the document has
 * `components.schemas` with `$ref`s rather than inlined copies. A schema
 * nested inside another (a candidate inside the lookup response) must be
 * listed in `NESTED_OUTPUT_SCHEMAS`, or Zod parks it in a shared bucket.
 *
 * The committed copy at `docs/partner-api/openapi.json` is regenerated with
 * `pnpm --filter @fastehr/contracts openapi:write`; the drift test fails
 * when the two disagree.
 */

export const PARTNER_API_VERSION = '1.0.0'
export const PARTNER_API_BASE_PATH = '/api/v1'

type JsonObject = Record<string, unknown>

/** Output schemas that appear only inside another output schema. */
const NESTED_OUTPUT_SCHEMAS: readonly z.ZodType[] = [partnerPatientCandidateSchema, partnerQueueLocationCountSchema]

function metaId(schema: z.ZodType): string {
  const meta = schema.meta() as { id?: string } | undefined
  if (meta?.id === undefined) throw new Error('every partner schema must carry a meta id')
  return meta.id
}

/** Strip the per-schema `$schema`/`$id` keys Zod writes: inside `components` they are noise. */
function asComponent(schema: JsonObject): JsonObject {
  const { $schema: _dialect, $id: _id, ...rest } = schema
  return rest
}

function schemaRef(id: string): JsonObject {
  return { $ref: `#/components/schemas/${id}` }
}

function renderComponents(schemas: readonly z.ZodType[], io: 'input' | 'output'): Record<string, JsonObject> {
  const registry = z.registry<{ id: string }>()
  for (const schema of schemas) registry.add(schema, { id: metaId(schema) })
  const rendered = z.toJSONSchema(registry, {
    uri: (id) => `#/components/schemas/${id}`,
    io,
    unrepresentable: 'any',
  }).schemas as Record<string, JsonObject>
  const components: Record<string, JsonObject> = {}
  for (const [id, schema] of Object.entries(rendered)) components[id] = asComponent(schema)
  return components
}

function pathParameters(operation: PartnerOperation): JsonObject[] {
  return (operation.path.match(/\{([^}]+)\}/g) ?? []).map((token) => ({
    name: token.slice(1, -1),
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  }))
}

function queryParameters(operation: PartnerOperation): JsonObject[] {
  if (operation.query === undefined) return []
  const rendered = z.toJSONSchema(operation.query, { io: 'input', unrepresentable: 'any' }) as JsonObject
  const properties = (rendered.properties ?? {}) as Record<string, JsonObject>
  const required = new Set((rendered.required ?? []) as string[])
  return Object.entries(properties).map(([name, schema]) => ({
    name,
    in: 'query',
    required: required.has(name),
    schema,
  }))
}

export function buildPartnerOpenApiDocument(): JsonObject {
  const bodies = PARTNER_OPERATIONS.flatMap((operation) => (operation.body === undefined ? [] : [operation.body]))
  const outputs = [
    ...PARTNER_OPERATIONS.map((operation) => operation.output),
    ...NESTED_OUTPUT_SCHEMAS,
    partnerErrorSchema.meta({ id: 'ErrorResponse' }),
  ]
  const schemas = { ...renderComponents(bodies, 'input'), ...renderComponents(outputs, 'output') }

  const errorResponse = (codes: readonly string[]) => ({
    description: codes.join(' | '),
    content: { 'application/json': { schema: schemaRef('ErrorResponse') } },
  })

  const paths: Record<string, JsonObject> = {}
  for (const operation of PARTNER_OPERATIONS) {
    const responses: Record<string, JsonObject> = {
      [String(operation.successStatus)]: {
        description: 'Success',
        content: { 'application/json': { schema: schemaRef(metaId(operation.output)) } },
      },
    }
    const byStatus = new Map<number, string[]>()
    for (const code of documentedErrors(operation)) {
      const status = PARTNER_ERROR_STATUS[code]
      byStatus.set(status, [...(byStatus.get(status) ?? []), code])
    }
    for (const [status, codes] of [...byStatus.entries()].sort((a, b) => a[0] - b[0])) {
      responses[String(status)] = errorResponse(codes.sort())
    }

    const parameters = [...pathParameters(operation), ...queryParameters(operation)]
    if (operation.requiresVerification) parameters.push({ $ref: '#/components/parameters/PatientVerification' })

    const entry: JsonObject = {
      operationId: operation.id,
      tags: [operation.id.split('.')[0]],
      summary: operation.summary,
      description: operation.description,
      security: [{ bearerKey: operation.scope === null ? [] : [operation.scope] }],
      'x-scope': operation.scope,
      'x-requires-verification': operation.requiresVerification,
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(operation.body !== undefined
        ? {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: schemaRef(metaId(operation.body)) } },
            },
          }
        : {}),
      responses,
    }

    const path = (paths[operation.path] ??= {})
    path[operation.method.toLowerCase()] = entry
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'FastEHR Partner API',
      version: PARTNER_API_VERSION,
      description:
        'Server-to-server API for approved partners. Every request carries a partner key as a Bearer token; patient-specific calls also carry a verification token obtained from the verify operation. Errors are codes, never messages. Responses are never cached.',
    },
    servers: [{ url: PARTNER_API_BASE_PATH }],
    tags: [
      { name: 'patients', description: 'Lookup and verification' },
      { name: 'queue', description: 'The live clinic queue' },
    ],
    paths,
    components: {
      securitySchemes: {
        bearerKey: {
          type: 'http',
          scheme: 'bearer',
          description: `A partner API key. Scopes: ${API_SCOPES.join(', ')}.`,
        },
      },
      parameters: {
        PatientVerification: {
          name: PATIENT_VERIFICATION_HEADER,
          in: 'header',
          required: true,
          description: 'The verification token issued by the verify operation for this patient.',
          schema: { type: 'string' },
        },
      },
      schemas,
    },
  }
}
