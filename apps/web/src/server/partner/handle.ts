import {
  buildPartnerOpenApiDocument,
  PARTNER_RATE_LIMITS,
  partnerApiEnabledSchema,
  type PartnerOperation,
  type PartnerScope,
} from '@fastehr/contracts'
import type { Db } from '@fastehr/db'
import type { AuditSink } from '../audit-log.ts'
import { authenticateApiKey } from './auth.ts'
import { runOperation, type OperationHandler } from './chain.ts'
import { createPartnerContext, type PartnerContext } from './context.ts'
import { DOCS_CONTENT_SECURITY_POLICY, DOCS_HTML } from './docs-page.ts'
import { errorResponse, PartnerApiError } from './errors.ts'
import { PARTNER_HANDLERS, type PartnerHandlers } from './handlers/index.ts'
import { jsonResponse, parsePartnerRequest, standardHeaders } from './http.ts'
import type { KeyVerifier } from './keys.ts'
import { perMinute, type RateLimiter } from './rate-limit.ts'
import { logPartnerRequest } from './request-log.ts'
import { matchRoute } from './router.ts'

/**
 * The partner API entry point (ADR 38): a `Request` in, a `Response` out,
 * with nothing from `next/*` (ADR 9). The Next route handler at
 * `app/api/v1/[[...path]]/route.ts` calls this and nothing else; a test
 * calls it with a hand-built `Request` and fakes.
 *
 * Order: the kill switch, the two documents (the docs page, and the OpenAPI
 * file, which is cut to the key presented with it), then route matching and
 * the chain.
 */
export interface PartnerHostOptions {
  db?: Db
  audit?: AuditSink
  now?: () => Date
  rateLimiter?: RateLimiter
  /** The key verifier; tests pass a fake, the host uses Better Auth's plugin. */
  keys?: KeyVerifier
  handlers?: PartnerHandlers
  /** Overrides the environment read; tests pass `true`. */
  enabled?: boolean
  env?: Record<string, string | undefined>
}

const openApiDocuments = new Map<string, string>()

/** The document for a set of scopes, rendered once per distinct set (there are few). */
function openApiJson(scopes: readonly PartnerScope[]): string {
  const key = [...scopes].sort().join(',')
  let rendered = openApiDocuments.get(key)
  if (rendered === undefined) {
    rendered = JSON.stringify(buildPartnerOpenApiDocument({ scopes }))
    openApiDocuments.set(key, rendered)
  }
  return rendered
}

/**
 * Which operations the document may show. No `Authorization` header: none,
 * the skeleton (how to authenticate, the error format). A header: the key
 * is authenticated exactly as a call would be, and a bad one is refused the
 * same way, counted against the same failed-authentication bucket, so the
 * document is not a cheaper oracle for keys than the API itself.
 */
async function scopesForDocument(headers: Headers, ctx: PartnerContext): Promise<readonly PartnerScope[] | PartnerApiError> {
  if (headers.get('authorization') === null) return []
  const failedAuthKey = `auth-fail:${ctx.ipAddress ?? 'unknown'}`
  const failedAuthLimit = perMinute(PARTNER_RATE_LIMITS.failedAuthPerIpPerMinute)
  if (!ctx.rateLimiter.peek(failedAuthKey, failedAuthLimit, ctx.now())) {
    return new PartnerApiError('rate_limited', { retryAfterSeconds: 60 })
  }
  try {
    return (await authenticateApiKey(headers, ctx)).scopes
  } catch (error) {
    if (error instanceof PartnerApiError) {
      if (error.code === 'unauthenticated') ctx.rateLimiter.take(failedAuthKey, failedAuthLimit, ctx.now())
      return error
    }
    throw error
  }
}

export async function handlePartnerRequest(request: Request, options: PartnerHostOptions = {}): Promise<Response> {
  const parsed = parsePartnerRequest(request)
  if (parsed === null) return errorResponse(new PartnerApiError('not_found'), 'none')

  const env = options.env ?? process.env
  const enabled = options.enabled ?? partnerApiEnabledSchema.parse(env.PARTNER_API_ENABLED)
  if (!enabled) return errorResponse(new PartnerApiError('not_found'), parsed.requestId)

  if (parsed.method === 'GET' && parsed.path === '/openapi.json') {
    const ctx = createPartnerContext({
      requestId: parsed.requestId,
      ipAddress: parsed.ipAddress,
      userAgent: parsed.userAgent,
      db: options.db,
      audit: options.audit,
      now: options.now,
      rateLimiter: options.rateLimiter,
      keys: options.keys,
    })
    const scopes = await scopesForDocument(parsed.headers, ctx)
    if (scopes instanceof PartnerApiError) return errorResponse(scopes, parsed.requestId)
    return new Response(openApiJson(scopes), {
      status: 200,
      headers: {
        ...standardHeaders(parsed.requestId),
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
  }
  if (parsed.method === 'GET' && parsed.path === '/docs') {
    return new Response(DOCS_HTML, {
      status: 200,
      headers: {
        ...standardHeaders(parsed.requestId),
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': DOCS_CONTENT_SECURITY_POLICY,
        'X-Frame-Options': 'DENY',
      },
    })
  }

  const match = matchRoute(parsed.method, parsed.path)
  if (match instanceof PartnerApiError) {
    logPartnerRequest({
      requestId: parsed.requestId,
      keyId: null,
      method: parsed.method,
      routeTemplate: '(unmatched)',
      status: match.status,
      durationMs: 0,
    })
    return errorResponse(match, parsed.requestId)
  }

  const ctx = createPartnerContext({
    requestId: parsed.requestId,
    ipAddress: parsed.ipAddress,
    userAgent: parsed.userAgent,
    db: options.db,
    audit: options.audit,
    now: options.now,
    rateLimiter: options.rateLimiter,
    keys: options.keys,
  })
  const handlers = options.handlers ?? PARTNER_HANDLERS
  // The registry and the handler table are typed against each other (the
  // mapped type in ./handlers/index.ts); at this one call site the union
  // of operations meets the union of handlers, which TypeScript cannot
  // correlate without the cast.
  const handler = handlers[match.operation.id] as OperationHandler<PartnerOperation>
  return runOperation<PartnerOperation>(match.operation, handler, request, parsed, match.params, ctx)
}

export { jsonResponse }
