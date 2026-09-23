import Link from "next/link"
import { guardPage } from "@/lib/guard-page"
import { api, HydrateClient } from "@/trpc/server"
import { IntegrationView } from "./integration-view.tsx"

/**
 * The partner account's one page (ADR 36 as amended): its integration, its
 * keys as the clinic lists them, how to call the API, and the door to the
 * reference at /api/v1/docs. Guarded by the `integration` surface, which
 * only that role holds; a staff account that lands here is told where it
 * belongs. The procedure behind the view re-checks on every call.
 */
export const dynamic = "force-dynamic"

export default async function IntegrationPage() {
  const gate = await guardPage("integration")

  if (gate.status === "forbidden") {
    return (
      <div className="py-16 text-center">
        <h1 className="text-lg font-semibold">403: forbidden</h1>
        <p className="text-sm text-muted-foreground">
          This page is for a partner integration account. Staff accounts use the clinic application.
        </p>
        <Link href="/queues" className="mt-4 inline-block text-sm underline">
          Back to the application
        </Link>
      </div>
    )
  }

  void api.integration.mine.prefetch()

  return (
    <HydrateClient>
      <IntegrationView />
    </HydrateClient>
  )
}
