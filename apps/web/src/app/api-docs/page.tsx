import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { GuardDenied, requireSession } from '@/server'
import { SwaggerView } from './swagger-view.tsx'

/**
 * Swagger UI over the generated OpenAPI document (ADR 35). Any signed-in
 * staff account may read it: the document describes access levels rather
 * than granting them, and "try it out" runs as the viewer, with the
 * viewer's role.
 */
export const dynamic = 'force-dynamic'

export default async function ApiDocsPage() {
  try {
    await requireSession(await headers())
  } catch (error) {
    if (!(error instanceof GuardDenied)) throw error
    redirect(error.code === 'PASSWORD_CHANGE_REQUIRED' ? '/change-password' : '/login')
  }

  return <SwaggerView documentUrl="/api/openapi.json" />
}
