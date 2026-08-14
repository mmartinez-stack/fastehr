import type React from "react"
import { OfficeProvider } from "@/components/office-provider"
import { RoleProvider } from "@/components/role-provider"
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
    <RoleProvider>
      <OfficeProvider offices={offices}>
        <div className="flex min-h-screen flex-col bg-background">
          <TopNav />
          <SmsBanner />
          {/*
            The clinic works on 1920×1080 monitors, and the shell used to cap
            at `max-w-7xl` — 1280px, a third of the screen left as gutter. The
            cap is now just wide enough to keep a line of body text readable
            at the far edge of a 1080p display; individual screens spend the
            width by gaining columns at `3xl`, not by stretching tables.
          */}
          <main className="mx-auto w-full max-w-[1800px] flex-1 px-4 py-6 lg:px-8">
            {children}
          </main>
        </div>
      </OfficeProvider>
    </RoleProvider>
  )
}
