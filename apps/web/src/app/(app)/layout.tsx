import type React from "react"
import { OfficeProvider } from "@/components/office-provider"
import { RoleProvider } from "@/components/role-provider"
import { sessionIdentity } from "@/trpc/session"
import { TopNav } from "@/components/top-nav"
import { SmsBanner } from "@/components/sms-banner"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // The server decides who this is: which sites they may see (ADR 22) and
  // which role's view renders (ADR 28). The providers only carry that down.
  const identity = await sessionIdentity()

  return (
    <RoleProvider sessionRole={identity?.role ?? null} medicalDirector={identity?.medicalDirector ?? false}>
      <OfficeProvider offices={identity?.offices ?? []}>
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
