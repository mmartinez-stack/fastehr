import { randomUUID } from 'node:crypto'
import { PARTNER_API_BASE_PATH } from '@fastehr/contracts'
import { PartnerApiError } from './errors.ts'

/**
 * The HTTP edge of the partner API, in Fetch terms only (ADR 9: nothing
 * from `next/*`, so the layer mounts anywhere a `Request` arrives).
 *
 * Every response leaves with the same headers: no caching anywhere between
 * here and the partner, no content sniffing, no referrer, a request id the
 * partner can quote, and a content security policy that allows nothing (the
 * docs page relaxes it for its own assets). No CORS header is ever set:
 * this is a server-to-server surface, and a browser call from anywhere is
 * meant to fail.
 */

/** A request body larger than this is refused before it is parsed. */
export const MAX_BODY_BYTES = 16 * 1024

export interface ParsedRequest {
  method: string
  /** The path under the base, with a leading slash: `/patients/lookup`. */
  path: string
  url: URL
  headers: Headers
  requestId: string
  ipAddress: string | null
  userAgent: string | null
}

/**
 * The client address is the first `X-Forwarded-For` entry. Caddy overwrites
 * the header with the peer address (the runbook says so), and the container
 * port is not published, so the value is the proxy's word and not the
 * caller's. Without a proxy there is no header and the address is unknown.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded === null) return null
  const first = forwarded.split(',')[0]?.trim() ?? ''
  return first === '' ? null : first
}

/** `null` when the URL is not under the partner base path at all. */
export function parsePartnerRequest(request: Request, basePath: string = PARTNER_API_BASE_PATH): ParsedRequest | null {
  const url = new URL(request.url)
  if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) return null
  const rest = url.pathname.slice(basePath.length)
  const path = rest === '' ? '/' : rest.replace(/\/+$/, '') || '/'
  return {
    method: request.method.toUpperCase(),
    path,
    url,
    headers: request.headers,
    // Generated here, never taken from the client: a partner-chosen id could
    // collide with or impersonate another request's in the trail.
    requestId: randomUUID(),
    ipAddress: clientIp(request.headers),
    userAgent: request.headers.get('user-agent'),
  }
}

/**
 * Reads a JSON body under the size cap. The content type must say JSON, the
 * declared length and the actual bytes are both capped, and a parse failure
 * is an `invalid_input` with a form-level code, never the text that failed.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!/^application\/json\b/i.test(contentType)) throw new PartnerApiError('unsupported_media_type')

  const declared = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new PartnerApiError('payload_too_large')

  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength > MAX_BODY_BYTES) throw new PartnerApiError('payload_too_large')
  if (bytes.byteLength === 0) {
    throw new PartnerApiError('invalid_input', { validation: { fieldErrors: {}, formErrors: ['invalid_json'] } })
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new PartnerApiError('invalid_input', { validation: { fieldErrors: {}, formErrors: ['invalid_json'] } })
  }
}

export function standardHeaders(requestId: string): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'X-Request-Id': requestId,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  }
}

export function jsonResponse(
  status: number,
  body: unknown,
  requestId: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...standardHeaders(requestId),
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  })
}
