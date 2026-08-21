import { createAuthClient } from 'better-auth/react'

/**
 * The browser half of authentication: the sign-in form, sign-out, and the
 * password-change call. Nothing else belongs here — session *verification* is
 * server-side only (`actorFromHeaders` / the guards), and no code may trust a
 * role or flag read on the client.
 *
 * `baseURL` is omitted on purpose: requests go to the current origin's
 * `/api/auth`, which is where `app/api/auth/[...all]` mounts the server.
 */
export const authClient = createAuthClient()
