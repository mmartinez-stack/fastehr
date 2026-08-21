import { getAuth } from '@/server'

/**
 * The Better Auth mount point — sign-in, sign-out, session, password change
 * all arrive here. Like the tRPC route, this file sits outside the
 * `src/server/**` fence and is the bridge between Next and the server layer.
 *
 * `getAuth()` is called per request rather than at module load so that
 * building this route requires no environment (the instance construction
 * reads BETTER_AUTH_SECRET).
 */

// Auth endpoints are per-request by definition — never prerender them.
export const dynamic = 'force-dynamic'

function handler(request: Request) {
  return getAuth().handler(request)
}

export { handler as GET, handler as POST }
