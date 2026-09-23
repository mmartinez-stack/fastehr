import { headers } from 'next/headers'
import { appRouter, buildOpenApiDocument, GuardDenied, requireSurface } from '@/server'

/**
 * The OpenAPI document for what this deployment mounts, generated from the
 * router on every request (ADR 35, amended). Behind the `staff` surface,
 * like the /api-docs page that reads it: the schema of a clinic's API is
 * not patient data, but it is an operator's reference, not a notice to
 * every staff account. No session answers 401; a session without the
 * surface answers 403.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  try {
    await requireSurface(await headers(), 'staff')
  } catch (error) {
    if (!(error instanceof GuardDenied)) throw error
    return Response.json({ error: error.code }, { status: error.code === 'UNAUTHENTICATED' ? 401 : 403 })
  }

  return Response.json(buildOpenApiDocument(appRouter), {
    headers: { 'cache-control': 'no-store' },
  })
}
