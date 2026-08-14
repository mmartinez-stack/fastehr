import type React from "react"
import { OfficeProvider } from "@/components/office-provider"
import { permittedOffices } from "@/trpc/session"
import { TopNav } from "@/components/top-nav"
import { SmsBanner } from "@/components/sms-banner"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // The server decides which sites this user may see; the provider only lets
  // them pick among those. See ADR 22.
  const offices = await permittedOffices()

  return (
    <OfficeProvider offices={offices}>
      <div className="flex min-h-screen flex-col bg-background">
        <TopNav />
        <SmsBanner />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-6">
          {children}
        </main>
      </div>
    </OfficeProvider>
  )
}
