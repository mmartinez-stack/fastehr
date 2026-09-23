import { guardPage } from '@/lib/guard-page'
import { SwaggerView } from './swagger-view.tsx'

/**
 * Swagger UI over the generated OpenAPI document (ADR 35, amended). Behind
 * the `staff` surface, so the administrator and the medical director read
 * it and a clinician or the front desk gets a refusal: the reference is an
 * operator's tool, and "try it out" runs as the viewer. The document route
 * it reads applies the same guard, so the page is presentation and the
 * route is the boundary.
 */
export const dynamic = 'force-dynamic'

export default async function ApiDocsPage() {
  const gate = await guardPage('staff')

  if (gate.status === 'forbidden') {
    return (
      <div className="py-16 text-center">
        <h1 className="text-lg font-semibold">403: forbidden</h1>
        <p className="text-sm text-muted-foreground">The API reference requires administrator access.</p>
      </div>
    )
  }

  return <SwaggerView documentUrl="/api/openapi.json" />
}
