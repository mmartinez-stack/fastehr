import {
  describeValidationFailure,
  PARTNER_RATE_LIMITS,
  type OptionalSchemaOutput,
  type PartnerErrorCode,
  type PartnerOperation,
  type PartnerSchema,
  type PhiAuditEvent,
  type SchemaInput,
  type SchemaOutput,
} from '@fastehr/contracts'
import { authenticateApiKey } from './auth.ts'
import type { PartnerActor, PartnerContext } from './context.ts'
import { DENIAL_CODES, errorResponse, PartnerApiError } from './errors.ts'
import { jsonResponse, readJsonBody, type ParsedRequest } from './http.ts'
import { perMinute } from './rate-limit.ts'
import { logPartnerRequest } from './request-log.ts'
import { resolveVerification } from './verification.ts'

/**
 * The partner request chain, in the order ADR 10 fixed for tRPC:
 *
 *   audit -> authenticate -> authorize -> rate limit -> verification -> validate -> handle -> shape
 *
 * Audit is outermost, so a refused key, a missing scope, a locked-out
 * patient, and a bad body all leave a row (ADR 37) with the outcome the
 * investigation wants: `denied` for a refusal, `error` for a failure. The
 * handler's result is parsed through the operation's output schema on the
 * way out, so nothing the contract does not describe reaches the wire.
 */

/** The context a handler sees: authenticated, with the actor narrowed. */
export type AuthenticatedContext = PartnerContext & { actor: PartnerActor }

type Output<Schema> = OptionalSchemaOutput<Schema>

export interface HandlerArgs<Op extends PartnerOperation> {
  ctx: AuthenticatedContext
  params: Output<Op['params']>
  query: Output<Op['query']>
  body: Output<Op['body']>
  headers: Headers
}

export type OperationHandler<Op extends PartnerOperation> = (args: HandlerArgs<Op>) => Promise<SchemaInput<Op['output']>>

function parseOrThrow<Schema extends PartnerSchema>(schema: Schema, value: unknown): SchemaOutput<Schema> {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  throw new PartnerApiError('invalid_input', {
    validation: describeValidationFailure(result.error) ?? { fieldErrors: {}, formErrors: ['invalid'] },
  })
}

/** Lookup and verify are the enumeration surface: a tighter bucket than the rest. */
function isIdentityOperation(operation: PartnerOperation): boolean {
  return operation.scope === 'patients:lookup' || operation.scope === 'patients:verify'
}

function outcomeFor(code: PartnerErrorCode | undefined): PhiAuditEvent['outcome'] {
  if (code === undefined) return 'allowed'
  return DENIAL_CODES.has(code) ? 'denied' : 'error'
}

export async function runOperation<Op extends PartnerOperation>(
  operation: Op,
  handler: OperationHandler<Op>,
  request: Request,
  parsed: ParsedRequest,
  routeParams: Record<string, string>,
  ctx: PartnerContext,
): Promise<Response> {
  const startedAt = Date.now()
  let response: Response
  let code: PartnerErrorCode | undefined

  const failedAuthKey = `auth-fail:${ctx.ipAddress ?? 'unknown'}`
  const failedAuthLimit = perMinute(PARTNER_RATE_LIMITS.failedAuthPerIpPerMinute)

  try {
    // An address that has failed authentication too often is refused before
    // the database is asked anything.
    if (!ctx.rateLimiter.peek(failedAuthKey, failedAuthLimit, ctx.now())) {
      throw new PartnerApiError('rate_limited', { retryAfterSeconds: 60 })
    }

    let actor: PartnerActor
    try {
      actor = await authenticateApiKey(parsed.headers, ctx)
    } catch (error) {
      if (error instanceof PartnerApiError && error.code === 'unauthenticated') {
        ctx.rateLimiter.take(failedAuthKey, failedAuthLimit, ctx.now())
      }
      throw error
    }
    ctx.actor = actor

    if (operation.scope !== null && !actor.scopes.includes(operation.scope)) throw new PartnerApiError('forbidden')

    // The overall per-key limit is the key row's own counter, checked by the
    // verifier above; what remains here are the finer buckets.
    if (isIdentityOperation(operation)) {
      const identity = ctx.rateLimiter.take(
        `identity:${actor.integrationId}`,
        perMinute(PARTNER_RATE_LIMITS.identityPerIntegrationPerMinute),
        ctx.now(),
      )
      if (!identity.allowed) throw new PartnerApiError('rate_limited', { retryAfterSeconds: identity.retryAfterSeconds })
    }

    const params = (operation.params === undefined ? {} : parseOrThrow(operation.params, routeParams)) as Output<
      Op['params']
    >

    if (operation.requiresVerification) {
      const patientId = (params as { patientId?: unknown }).patientId
      if (typeof patientId !== 'string') throw new PartnerApiError('verification_required')
      const verification = await resolveVerification(ctx, {
        integrationId: actor.integrationId,
        patientId,
        headers: parsed.headers,
      })
      ctx.auditScope.patientId = verification.patientId
      ctx.auditScope.verificationId = verification.id
    }

    const query = (
      operation.query === undefined ? {} : parseOrThrow(operation.query, Object.fromEntries(parsed.url.searchParams))
    ) as Output<Op['query']>
    const body = (operation.body === undefined ? {} : parseOrThrow(operation.body, await readJsonBody(request))) as Output<
      Op['body']
    >

    const result = await handler({ ctx: { ...ctx, actor }, params, query, body, headers: parsed.headers })
    const shaped: unknown = operation.output.parse(result)
    response = jsonResponse(operation.successStatus, shaped, ctx.requestId)
  } catch (error) {
    const apiError = error instanceof PartnerApiError ? error : new PartnerApiError('internal_error')
    if (apiError.code === 'internal_error') console.error('[partner-api] unhandled', ctx.requestId, error)
    code = apiError.code
    response = errorResponse(apiError, ctx.requestId)
  }

  const durationMs = Date.now() - startedAt
  ctx.audit.record({
    transport: 'rest',
    actorKind: ctx.actor === null ? 'anonymous' : 'integration',
    actorId: ctx.actor?.integrationId ?? null,
    apiKeyId: ctx.actor?.keyId ?? null,
    verificationId: ctx.auditScope.verificationId ?? null,
    action: operation.id,
    method: operation.method,
    routeTemplate: operation.path,
    outcome: outcomeFor(code),
    code: code ?? null,
    httpStatus: response.status,
    patientId: ctx.auditScope.patientId ?? null,
    resourceKind: ctx.auditScope.resourceKind ?? null,
    resourceId: ctx.auditScope.resourceId ?? null,
    requestId: ctx.requestId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    durationMs,
  })
  logPartnerRequest({
    requestId: ctx.requestId,
    keyId: ctx.actor?.keyId ?? null,
    method: operation.method,
    routeTemplate: operation.path,
    status: response.status,
    durationMs,
  })

  return response
}
