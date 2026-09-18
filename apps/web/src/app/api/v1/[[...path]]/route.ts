import { handlePartnerRequest } from '@/server'

/**
 * The partner API mount point (ADR 36), the third and last file that bridges
 * Next.js into the server layer (with the tRPC and auth routes). It holds
 * no logic: the request goes to `handlePartnerRequest` as a plain `Request`,
 * which is what keeps `src/server/partner/**` mountable anywhere (ADR 9).
 *
 * It never resolves a staff session: a Better Auth cookie means nothing
 * here, and a partner key means nothing on `/api/trpc`.
 */

// Per-request by definition; never prerender.
export const dynamic = 'force-dynamic'

function handler(request: Request) {
  return handlePartnerRequest(request)
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE }
