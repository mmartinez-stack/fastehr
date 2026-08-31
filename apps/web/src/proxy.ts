import { getSessionCookie } from 'better-auth/cookies'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Signed-out visitors are redirected to /login before an app route renders.
 * Without this, an anonymous request to a page that never calls `guardPage`
 * (today, every mockup route) rendered the app shell with zero permitted
 * offices — a dead end that reads like a data problem, not a sign-in prompt.
 *
 * The check is deliberately optimistic: cookie *presence*, no database read.
 * A forged cookie earns the shell and nothing else — session verification
 * stays server-side (`actorFromHeaders`), and every data read re-checks at
 * the procedure guards. This gate is presentation, exactly like the page-side
 * `guardPage`; the middleware chain remains the security boundary (ADR 9/10).
 *
 * Excluded from the matcher:
 *   - /api        — the auth mount and tRPC answer JSON, never redirects
 *   - /login      — the destination; matching it would loop
 *   - /_smoke     — probed unauthenticated by scripts/smoke.mjs
 *   - /_next, dotted paths — build assets and files
 * /change-password stays covered: a temp credential holds a session cookie
 * and passes; an anonymous visitor is sent to /login one hop earlier than the
 * page's own server-side guard would have.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request) !== null) return NextResponse.next()

  const login = new URL('/login', request.url)
  const { pathname, search } = request.nextUrl
  // '/' forwards to /queues on its own; a `next` of "/" would only restate it.
  if (pathname !== '/') login.searchParams.set('next', pathname + search)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/((?!api|_next|_smoke|login|.*\\..*).*)'],
}
