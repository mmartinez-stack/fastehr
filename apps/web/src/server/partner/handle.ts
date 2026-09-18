import { buildPartnerOpenApiDocument, partnerApiEnabledSchema, type PartnerOperation } from '@fastehr/contracts'
import type { Db } from '@fastehr/db'
import type { AuditSink } from '../audit-log.ts'
import { runOperation, type OperationHandler } from './chain.ts'
import { createPartnerContext } from './context.ts'
import { DOCS_CONTENT_SECURITY_POLICY, DOCS_HTML } from './docs-page.ts'
import { errorResponse, PartnerApiError } from './errors.ts'
import { PARTNER_HANDLERS, type PartnerHandlers } from './handlers/index.ts'
import { jsonResponse, parsePartnerRequest, standardHeaders } from './http.ts'
import type { RateLimiter } from './rate-limit.ts'
import { logPartnerRequest } from './request-log.ts'
import { matchRoute } from './router.ts'

/**
 * The partner API entry point (ADR 36): a `Request` in, a `Response` out,
 * with nothing from `next/*` (ADR 9). The Next route handler at
 * `app/api/v1/[[...path]]/route.ts` calls this and nothing else; a test
 * calls it with a hand-built `Request` and fakes.
 *
 * Order: the kill switch, the two unauthenticated documents (the OpenAPI file and the docs page, which carry no PHI), then
 * route matching and the chain.
 */
export interface PartnerHostOptions {
  db?: Db
  audit?: AuditSink
  now?: () => Date
  rateLimiter?: RateLimiter
  handlers?: PartnerHandlers
  /** Overrides the environment read; tests pass `true`. */
  enabled?: boolean
  env?: Record<string, string | undefined>
}

let openApiDocument: string | undefined

function openApiJson(): string {
  return (openApiDocument ??= JSON.stringify(buildPartnerOpenApiDocument()))
}

export async function handlePartnerRequest(request: Request, options: PartnerHostOptions = {}): Promise<Response> {
  const parsed = parsePartnerRequest(request)
  if (parsed === null) return errorResponse(new PartnerApiError('not_found'), 'none')

  const env = options.env ?? process.env
  const enabled = options.enabled ?? partnerApiEnabledSchema.parse(env.PARTNER_API_ENABLED)
  if (!enabled) return errorResponse(new PartnerApiError('not_found'), parsed.requestId)

  if (parsed.method === 'GET' && parsed.path === '/openapi.json') {
    return new Response(openApiJson(), {
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
