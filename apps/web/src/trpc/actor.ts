import type { Actor } from '@/server'

/**
 * The single place a session becomes an `Actor`.
 *
 * Takes the raw `Cookie` header rather than a transport object, so the two
 * hosts that need it — the tRPC route handler, which has a `Request`, and the
 * RSC caller, which has `next/headers` — share one implementation instead of
 * growing two that drift. It also keeps this module free of `next/*`, which
 * makes it directly testable.
 *
 * Placeholder: returns `null`, so every protected procedure refuses (and, since
 * the audit runs outermost, records the refusal). The auth ticket replaces the
 * body; the signature is the seam it plugs into.
 */
export function actorFromCookieHeader(_cookieHeader: string | null): Actor | null {
  return null
}
