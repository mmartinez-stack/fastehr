import { headers } from 'next/headers'
import { appRouter, buildOpenApiDocument, GuardDenied, requireSession } from '@/server'

/**
 * The OpenAPI document for what this deployment mounts, generated from the
 * router on every request (ADR 35). Behind a session like every page: the
 * schema of a clinic's API is not patient data, but it is not a public
 * notice either, and the /api-docs page that reads it is signed-in only.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  try {
    await requireSession(await headers())
  } catch (error) {
    if (!(error instanceof GuardDenied)) throw error
    return Response.json({ error: error.code }, { status: error.code === 'UNAUTHENTICATED' ? 401 : 403 })
  }

  return Response.json(buildOpenApiDocument(appRouter), {
    headers: { 'cache-control': 'no-store' },
  })
}
